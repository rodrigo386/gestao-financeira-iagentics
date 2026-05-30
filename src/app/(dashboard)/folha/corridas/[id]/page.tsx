import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buscarFolha, listarItensFolha } from '@/modules/folha/corrida'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ItemFolha } from '@/lib/schemas/folha'

function formatMesRef(mesRef: string): string {
  const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
  const parts = mesRef.split('-').map(Number)
  return `${meses[parts[1]! - 1]}/${parts[0]}`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatBRL(val: number) {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

type ItemWithFunc = ItemFolha & {
  funcionario: { nome: string; cargo: string; tipo: string } | null
  holerite: { storage_path: string } | null
}

export default async function CorridaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const folha = await buscarFolha(id)
  if (!folha) notFound()

  const supabase = await createClient()

  // Load items with funcionario and holerite info
  const { data: itemsRaw } = await supabase
    .from('itens_folha')
    .select('*, funcionario:funcionarios(nome, cargo, tipo), holerite:holerites(storage_path)')
    .eq('folha_id', id)
    .order('criado_em', { ascending: true })

  const items = (itemsRaw ?? []) as ItemWithFunc[]

  // Look up fechada_por user name
  let fechadaPorNome: string | null = null
  if (folha.fechada_por) {
    const { data: usuarioRow } = await supabase
      .from('usuarios')
      .select('nome')
      .eq('id', folha.fechada_por)
      .maybeSingle()
    fechadaPorNome = usuarioRow?.nome ?? null
  }

  // Compute totals
  const totals = items.reduce(
    (acc, item) => ({
      salario_bruto: acc.salario_bruto + item.salario_bruto,
      beneficios_valor: acc.beneficios_valor + item.beneficios_valor,
      inss_funcionario: acc.inss_funcionario + item.inss_funcionario,
      irrf: acc.irrf + item.irrf,
      liquido_pagar: acc.liquido_pagar + item.liquido_pagar,
      fgts: acc.fgts + item.fgts,
      inss_patronal: acc.inss_patronal + item.inss_patronal,
      provisao_13: acc.provisao_13 + item.provisao_13,
      provisao_ferias: acc.provisao_ferias + item.provisao_ferias,
      total_encargos: acc.total_encargos + item.total_encargos,
    }),
    {
      salario_bruto: 0,
      beneficios_valor: 0,
      inss_funcionario: 0,
      irrf: 0,
      liquido_pagar: 0,
      fgts: 0,
      inss_patronal: 0,
      provisao_13: 0,
      provisao_ferias: 0,
      total_encargos: 0,
    },
  )

  // Server action for closing the folha — close over folha.id
  const folhaId = folha.id
  const numAPs = items.length * 4 // rough max (salario + fgts + inss + beneficios)

  async function fechar(_formData: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) throw new Error('not authenticated')

    const { data: cats } = await sb.from('categorias').select('id, nome')
    const findCat = (nome: string) => (cats ?? []).find((c: { id: string; nome: string }) => c.nome === nome)?.id ?? ''

    const salarioCat = findCat('Salário CLT')
    const fgtsCat = findCat('FGTS')
    const inssCat = findCat('INSS Patronal')
    const beneficiosCat = findCat('VR/VA')

    if (!salarioCat || !fgtsCat || !inssCat || !beneficiosCat) {
      const missing = [
        !salarioCat && 'Salário CLT',
        !fgtsCat && 'FGTS',
        !inssCat && 'INSS Patronal',
        !beneficiosCat && 'VR/VA',
      ].filter(Boolean).join(', ')
      throw new Error(`Categorias não encontradas no banco: ${missing}. Execute o seed de categorias antes de fechar a folha.`)
    }

    const { fecharFolha } = await import('@/modules/folha/corrida')
    await fecharFolha(folhaId, user.id, {
      salarioCategoria: salarioCat,
      fgtsCategoria: fgtsCat,
      inssCategoria: inssCat,
      beneficiosCategoria: beneficiosCat,
    })
    revalidatePath(`/folha/corridas/${folhaId}`)
    revalidatePath('/contas-pagar')
    revalidatePath('/folha')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            Folha {formatMesRef(folha.mes_ref)}
          </h1>
          <Badge variant={folha.status === 'fechada' ? 'secondary' : 'default'}>
            {folha.status === 'fechada' ? 'Fechada' : 'Aberta'}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground space-x-4">
          <span>Gerada em: {formatDateTime(folha.gerada_em)}</span>
          {folha.fechada_em && (
            <span>Fechada em: {formatDateTime(folha.fechada_em)}</span>
          )}
          {fechadaPorNome && (
            <span>Por: {fechadaPorNome}</span>
          )}
        </div>
        <div className="pt-1">
          <Link href="/folha/corridas" className="text-sm text-primary underline">
            ← Voltar para corridas
          </Link>
        </div>
      </div>

      {/* Items table */}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item nesta corrida (sem funcionarios ativos).</p>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-3 py-3 whitespace-nowrap">Funcionario</th>
                <th className="px-3 py-3 whitespace-nowrap">Cargo</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Sal. Bruto</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Beneficios</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">INSS</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">IRRF</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Liquido</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">FGTS</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">INSS Pat.</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Prov. 13º</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Prov. Ferias</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Total Enc.</th>
                <th className="px-3 py-3 whitespace-nowrap">Holerite</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-3 font-medium whitespace-nowrap">
                    {item.funcionario?.nome ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                    {item.funcionario?.cargo ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatBRL(item.salario_bruto)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatBRL(item.beneficios_valor)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatBRL(item.inss_funcionario)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatBRL(item.irrf)}</td>
                  <td className="px-3 py-3 text-right font-medium whitespace-nowrap">{formatBRL(item.liquido_pagar)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatBRL(item.fgts)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatBRL(item.inss_patronal)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatBRL(item.provisao_13)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatBRL(item.provisao_ferias)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatBRL(item.total_encargos)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {item.holerite ? (
                      <a
                        href={`/api/holerite/${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline"
                      >
                        PDF
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="border-t bg-muted font-medium">
                <td className="px-3 py-3" colSpan={2}>
                  Total ({items.length} funcionario(s))
                </td>
                <td className="px-3 py-3 text-right">{formatBRL(totals.salario_bruto)}</td>
                <td className="px-3 py-3 text-right">{formatBRL(totals.beneficios_valor)}</td>
                <td className="px-3 py-3 text-right">{formatBRL(totals.inss_funcionario)}</td>
                <td className="px-3 py-3 text-right">{formatBRL(totals.irrf)}</td>
                <td className="px-3 py-3 text-right">{formatBRL(totals.liquido_pagar)}</td>
                <td className="px-3 py-3 text-right">{formatBRL(totals.fgts)}</td>
                <td className="px-3 py-3 text-right">{formatBRL(totals.inss_patronal)}</td>
                <td className="px-3 py-3 text-right">{formatBRL(totals.provisao_13)}</td>
                <td className="px-3 py-3 text-right">{formatBRL(totals.provisao_ferias)}</td>
                <td className="px-3 py-3 text-right">{formatBRL(totals.total_encargos)}</td>
                <td className="px-3 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Close action — only shown when aberta */}
      {folha.status === 'aberta' && items.length > 0 && (
        <div className="flex justify-end">
          <div className="space-y-3 text-right max-w-md">
            <p className="text-sm text-muted-foreground">
              Ao fechar, serao gerados aproximadamente {numAPs} APs de pagamento e os holerites PDF serao criados.
              A acao e irreversivel.
            </p>
            <form action={fechar}>
              <Button type="submit" size="lg">
                Fechar folha (gera APs)
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
