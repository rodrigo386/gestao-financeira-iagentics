import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { buscarPJSpot, listarAlocacoes, criarAlocacao, concluirAlocacao, atualizarAlocacao } from '@/modules/folha/pj-spot'
import { listarProjetos } from '@/modules/receitas/projetos'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlocacaoForm, AlocacaoFormData } from '@/components/forms/alocacao-form'
import { AlocacaoRow } from '@/components/alocacao-row'

function formatBRL(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

type Props = { params: Promise<{ id: string }> }

export default async function PJSpotDetailPage({ params }: Props) {
  const { id } = await params
  const pj = await buscarPJSpot(id)
  if (!pj) notFound()

  const [{ data: alocacoes }, projetos] = await Promise.all([
    listarAlocacoes({ pj_id: id }),
    listarProjetos({ status: 'ativo' }),
  ])

  async function handleAddAlocacao(formData: AlocacaoFormData) {
    'use server'
    await criarAlocacao({
      pj_id: formData.pj_id,
      projeto_id: formData.projeto_id?.trim() || undefined,
      descricao: formData.descricao,
      tipo_remuneracao: formData.tipo_remuneracao,
      valor_total: formData.valor_total,
      horas_estimadas: formData.horas_estimadas,
      data_inicio: formData.data_inicio,
      data_prevista_fim: formData.data_prevista_fim,
    })
    revalidatePath(`/folha/pj-spot/${id}`)
  }

  async function handleFaturar(alocacaoId: string, dataReal: string) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const usuarioId = user?.id ?? 'system'
    await concluirAlocacao(alocacaoId, dataReal, usuarioId)
    revalidatePath(`/folha/pj-spot/${id}`)
    redirect(`/folha/pj-spot/${id}`)
  }

  async function editarAlocacaoAction(alocacaoId: string, patch: Partial<AlocacaoFormData>) {
    'use server'
    await atualizarAlocacao(alocacaoId, {
      projeto_id: patch.projeto_id?.trim() || undefined,
      descricao: patch.descricao,
      tipo_remuneracao: patch.tipo_remuneracao,
      valor_total: patch.valor_total,
      horas_estimadas: patch.horas_estimadas,
      data_inicio: patch.data_inicio,
      data_prevista_fim: patch.data_prevista_fim,
    })
    revalidatePath(`/folha/pj-spot/${id}`)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{pj.nome}</h1>
          <div className="flex gap-3 items-center mt-2">
            <Badge variant={pj.ativo ? 'default' : 'secondary'}>{pj.ativo ? 'Ativo' : 'Inativo'}</Badge>
            {pj.especialidade && <span className="text-sm text-muted-foreground">{pj.especialidade}</span>}
          </div>
        </div>
        <Link
          href={`/folha/pj-spot/${id}/editar`}
          className="ml-auto rounded-md border border-border px-3 py-1.5 text-sm text-primary hover:bg-accent"
        >
          Editar PJ
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Contato</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {pj.cpf_cnpj && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CPF/CNPJ</span>
                <span>{pj.cpf_cnpj}</span>
              </div>
            )}
            {pj.contato_email && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span>{pj.contato_email}</span>
              </div>
            )}
            {pj.contato_telefone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Telefone</span>
                <span>{pj.contato_telefone}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Financeiro</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor/Hora Padrão</span>
              <span className="font-medium">
                {pj.valor_hora_padrao != null ? formatBRL(pj.valor_hora_padrao) : '—'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alocações */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Alocações ({alocacoes.length})</h2>
        {alocacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma alocação registrada.</p>
        ) : (
          <div className="border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Valor Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Período</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {alocacoes.map((a) => (
                  <AlocacaoRow
                    key={a.id}
                    alocacao={{
                      id: a.id,
                      pj_id: a.pj_id,
                      projeto_id: a.projeto_id ?? undefined,
                      descricao: a.descricao,
                      tipo_remuneracao: a.tipo_remuneracao,
                      valor_total: a.valor_total,
                      horas_estimadas: a.horas_estimadas ?? undefined,
                      data_inicio: a.data_inicio,
                      data_prevista_fim: a.data_prevista_fim,
                      status: a.status,
                      ap_id: a.ap_id ?? undefined,
                    }}
                    projetos={projetos}
                    onEditar={editarAlocacaoAction}
                    onFaturar={handleFaturar}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <AlocacaoForm pjId={id} projetos={projetos} onSubmit={handleAddAlocacao} />
      </section>
    </div>
  )
}
