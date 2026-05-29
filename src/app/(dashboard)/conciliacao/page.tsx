import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type BreakTipo =
  | 'matched'
  | 'timing-break'
  | 'amount-break'
  | 'mapping-issue'
  | 'duplicate'
  | 'bank-only'
  | 'ledger-only'

function BreakBadge({ tipo }: { tipo: string }) {
  const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    matched: 'default',
    'timing-break': 'outline',
    'amount-break': 'destructive',
    'mapping-issue': 'destructive',
    duplicate: 'secondary',
    'bank-only': 'secondary',
    'ledger-only': 'secondary',
  }
  return <Badge variant={map[tipo] ?? 'secondary'}>{tipo}</Badge>
}

export default async function ConciliacaoPage() {
  const supabase = await createClient()

  const { data: sugestoes } = await supabase
    .from('sugestoes_conciliacao')
    .select('*, lancamento:lancamentos(id, data, valor, descricao, tipo, conciliado)')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: false })
    .limit(100)

  async function aceitarSugestao(formData: FormData) {
    'use server'
    const sugestaoId = formData.get('sugestao_id') as string
    const candidatoId = formData.get('candidato_id') as string | null
    const candidatoTipo = formData.get('candidato_tipo') as 'ap' | 'ar' | null
    const lancamentoId = formData.get('lancamento_id') as string
    const lancamentoData = formData.get('lancamento_data') as string
    const lancamentoTipo = formData.get('lancamento_tipo') as string

    const admin = createServiceClient()

    if (candidatoId && candidatoTipo) {
      const isEntrada = lancamentoTipo === 'entrada'
      const updateTable = isEntrada ? 'contas_a_receber' : 'contas_a_pagar'
      const newStatus = isEntrada ? 'recebido' : 'pago'
      const dateField = isEntrada ? 'data_recebimento' : 'data_pagamento'

      await admin.from(updateTable).update({
        status: newStatus,
        [dateField]: lancamentoData,
        lancamento_id: lancamentoId,
      }).eq('id', candidatoId)
    }

    await admin.from('lancamentos').update({ conciliado: true }).eq('id', lancamentoId)
    await admin
      .from('sugestoes_conciliacao')
      .update({ status: 'aceita', resolvida_em: new Date().toISOString() })
      .eq('id', sugestaoId)

    revalidatePath('/conciliacao')
  }

  async function rejeitarSugestao(formData: FormData) {
    'use server'
    const sugestaoId = formData.get('sugestao_id') as string
    const admin = createServiceClient()
    await admin
      .from('sugestoes_conciliacao')
      .update({ status: 'rejeitada', resolvida_em: new Date().toISOString() })
      .eq('id', sugestaoId)
    revalidatePath('/conciliacao')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Conciliação — Sugestões Pendentes</h1>
        <p className="text-sm text-muted-foreground">
          {sugestoes?.length ?? 0} sugestão(ões) aguardando revisão
        </p>
      </div>

      {!sugestoes || sugestoes.length === 0 ? (
        <div className="border rounded-md px-4 py-10 text-center text-muted-foreground">
          Nenhuma sugestão pendente.
        </div>
      ) : (
        <div className="border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-4 py-3">Lançamento</th>
                <th className="px-4 py-3">Candidato</th>
                <th className="px-4 py-3">Break</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Explicação</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sugestoes.map((s) => {
                const lanc = s.lancamento as {
                  id: string
                  data: string
                  valor: number
                  descricao: string
                  tipo: string
                  conciliado: boolean
                } | null
                const isEntrada = lanc?.tipo === 'entrada'
                const apArPath = s.candidato_tipo === 'ar' ? '/contas-receber' : '/contas-pagar'

                return (
                  <tr key={s.id} className="border-t align-top">
                    <td className="px-4 py-3">
                      {lanc ? (
                        <div>
                          <div className="text-xs text-muted-foreground">{lanc.data}</div>
                          <div className="font-medium truncate max-w-[180px]">{lanc.descricao}</div>
                          <div className={`text-sm font-semibold ${isEntrada ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isEntrada ? '+' : '-'} R$ {Number(lanc.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.candidato_id ? (
                        <a
                          href={`${apArPath}/${s.candidato_id}`}
                          className="text-sm underline text-primary hover:underline"
                        >
                          {s.candidato_tipo?.toUpperCase()} {s.candidato_id.slice(0, 8)}…
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Sem candidato</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <BreakBadge tipo={s.break_tipo} />
                    </td>
                    <td className="px-4 py-3">
                      {Math.round(Number(s.score) * 100)}%
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px]">
                      {s.explicacao ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <form action={aceitarSugestao}>
                          <input type="hidden" name="sugestao_id" value={s.id} />
                          <input type="hidden" name="candidato_id" value={s.candidato_id ?? ''} />
                          <input type="hidden" name="candidato_tipo" value={s.candidato_tipo ?? ''} />
                          <input type="hidden" name="lancamento_id" value={lanc?.id ?? ''} />
                          <input type="hidden" name="lancamento_data" value={lanc?.data ?? ''} />
                          <input type="hidden" name="lancamento_tipo" value={lanc?.tipo ?? ''} />
                          <Button type="submit" size="sm">Aceitar</Button>
                        </form>
                        <form action={rejeitarSugestao}>
                          <input type="hidden" name="sugestao_id" value={s.id} />
                          <Button type="submit" size="sm" variant="outline">Rejeitar</Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
