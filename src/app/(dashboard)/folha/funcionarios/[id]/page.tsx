import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buscarFuncionario } from '@/modules/folha/funcionarios'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatBRL(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

type ItemFolhaRow = {
  id: string
  salario_bruto: number
  liquido_pagar: number
  folha: { mes_ref: string; status: string } | null
  holerite: { storage_path: string } | null
}

export default async function FuncionarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const funcionario = await buscarFuncionario(id)
  if (!funcionario) notFound()

  const supabase = await createClient()
  const { data: itens } = await supabase
    .from('itens_folha')
    .select('*, folha:folha(mes_ref, status), holerite:holerites(storage_path)')
    .eq('funcionario_id', id)
    .order('criado_em', { ascending: false })

  const itensTyped = (itens ?? []) as ItemFolhaRow[]

  const b = funcionario.beneficios_json ?? {}
  const e = funcionario.encargos_pct_json ?? {}

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{funcionario.nome}</h1>
        <div className="flex gap-3 items-center mt-2">
          <Badge variant="outline">{funcionario.tipo === 'clt' ? 'CLT' : 'PJ Recorrente'}</Badge>
          <Badge variant={funcionario.ativo ? 'default' : 'secondary'}>
            {funcionario.ativo ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Identificação */}
        <Card>
          <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cargo</span>
              <span>{funcionario.cargo}</span>
            </div>
            {funcionario.cpf && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CPF</span>
                <span>{funcionario.cpf}</span>
              </div>
            )}
            {funcionario.centro_custo && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Centro de Custo</span>
                <span>{funcionario.centro_custo}</span>
              </div>
            )}
            {funcionario.chave_pix && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chave PIX</span>
                <span>{funcionario.chave_pix}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Remuneração */}
        <Card>
          <CardHeader><CardTitle>Remuneração</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Salário Base</span>
              <span className="font-medium">{formatBRL(funcionario.salario_base)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Benefícios */}
        <Card>
          <CardHeader><CardTitle>Benefícios</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">VR (valor/dia)</span>
              <span>{formatBRL(Number(b.vr ?? 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VR (dias/mês)</span>
              <span>{String(b.vr_dias ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VA (R$/mês)</span>
              <span>{formatBRL(Number(b.va ?? 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plano de Saúde</span>
              <span>{formatBRL(Number(b.plano_saude ?? 0))}</span>
            </div>
          </CardContent>
        </Card>

        {/* Encargos */}
        <Card>
          <CardHeader><CardTitle>Encargos (%)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">FGTS</span>
              <span>{String(e.fgts ?? 8)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">INSS Patronal</span>
              <span>{String(e.inss_patronal ?? 20)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provisão 13º</span>
              <span>{String(e.provisao_13 ?? 8.33)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provisão Férias</span>
              <span>{String(e.provisao_ferias ?? 11.11)}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Datas */}
        <Card>
          <CardHeader><CardTitle>Datas</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Admissão</span>
              <span>{funcionario.data_admissao}</span>
            </div>
            {funcionario.data_desligamento && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Desligamento</span>
                <span>{funcionario.data_desligamento}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Histórico de Folha */}
      <section>
        <h2 className="text-lg font-medium mb-3">Histórico de Folha ({itensTyped.length})</h2>
        {itensTyped.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma folha processada para este funcionário.</p>
        ) : (
          <div className="border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-4 py-3">Mês de Ref.</th>
                  <th className="px-4 py-3">Status Folha</th>
                  <th className="px-4 py-3">Salário Bruto</th>
                  <th className="px-4 py-3">Líquido a Pagar</th>
                  <th className="px-4 py-3">Holerite</th>
                </tr>
              </thead>
              <tbody>
                {itensTyped.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-3">{item.folha?.mes_ref ?? '—'}</td>
                    <td className="px-4 py-3">
                      {item.folha && (
                        <Badge variant="outline">{item.folha.status}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">{formatBRL(item.salario_bruto)}</td>
                    <td className="px-4 py-3 font-medium">{formatBRL(item.liquido_pagar)}</td>
                    <td className="px-4 py-3">
                      {item.holerite ? (
                        <Link href={`/api/holerite/${item.id}`} className="text-sm text-primary underline" target="_blank">
                          Baixar PDF
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
