import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listarAP, aprovarAP, marcarAPPago, cancelarAP, gerarAPMes } from '@/modules/contas-pagar/ap'
import { APRowActions } from '@/components/ap-row-actions'
import { GerarMesButton, type GerarMesResult } from '@/components/gerar-mes-button'
import { withAudit } from '@/lib/audit'
import { Badge } from '@/components/ui/badge'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  previsto: 'outline',
  aprovado: 'default',
  pago: 'secondary',
  atrasado: 'destructive',
  cancelado: 'secondary',
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default async function ContasPagarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')

  const hoje = new Date()
  const back30 = new Date(hoje.getTime() - 30 * 86400_000).toISOString().slice(0, 10)
  const fwd60 = new Date(hoje.getTime() + 60 * 86400_000).toISOString().slice(0, 10)

  const rows = await listarAP({ vencimento_de: back30, vencimento_ate: fwd60 })

  const { data: contasRaw } = await supabase
    .from('contas_bancarias')
    .select('id, banco, agencia, conta')
    .eq('ativa', true)
  const contas = contasRaw ?? []

  async function aprovar(formData: FormData) {
    'use server'
    const id = formData.get('id') as string
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) throw new Error('not authenticated')
    await aprovarAP(id, u.id)
    revalidatePath('/contas-pagar')
  }

  async function pagar(formData: FormData) {
    'use server'
    const id = formData.get('id') as string
    const contaId = formData.get('conta_id') as string
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) throw new Error('not authenticated')
    const hoje = new Date().toISOString().slice(0, 10)
    await marcarAPPago(id, hoje, contaId, u.id)
    revalidatePath('/contas-pagar')
    revalidatePath('/')
  }

  async function cancelar(formData: FormData) {
    'use server'
    const id = formData.get('id') as string
    const motivo = (formData.get('motivo') as string) || 'cancelado pelo usuário'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) throw new Error('not authenticated')
    await cancelarAP(id, motivo, u.id)
    revalidatePath('/contas-pagar')
  }

  async function gerarAPAction(month: string): Promise<GerarMesResult> {
    'use server'
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('mês inválido')
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) throw new Error('não autenticado')
    const { data: me } = await sb.from('usuarios').select('role').eq('id', u.id).single()
    if (!me || !['admin', 'financeiro'].includes(me.role)) throw new Error('sem permissão para gerar contas a pagar')
    const refMonth = `${month}-01`
    const result = await withAudit(
      {
        usuario_id: u.id, acao: 'custom', tabela: 'contas_a_pagar', registro_id: refMonth,
        before: null, after: { mes_ref: refMonth }, motivo: 'gerar AP do mês (pagar)',
      },
      async () => gerarAPMes(refMonth),
    )
    revalidatePath('/contas-pagar')
    return result
  }

  const total = rows.reduce(
    (s, r) => s + (r.status !== 'cancelado' ? r.valor : 0),
    0,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas a Pagar</h1>
        <p className="text-sm text-muted-foreground">Últimos 30 dias + próximos 60 dias</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Gerenciar:</span>
        <Link href="/despesas/fornecedores" className="text-primary underline">Fornecedores</Link>
        <Link href="/despesas/recorrentes" className="text-primary underline">Despesas recorrentes</Link>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Gere as contas a pagar das despesas recorrentes para um mês. Idempotente — não duplica.
        </p>
        <GerarMesButton
          id="pagar-ap"
          label="Gerar contas a pagar do mês"
          pendingLabel="Gerando..."
          onGerar={gerarAPAction}
        />
      </div>

      {contas.length === 0 && (
        <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          Nenhuma conta bancária ativa cadastrada.{' '}
          <Link href="/config/contas-bancarias" className="text-primary underline">
            Cadastrar conta bancária
          </Link>{' '}
          para poder marcar APs como pagas.
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma conta a pagar no período.</p>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {rows.length} conta(s) · Total pendente:{' '}
            <strong>
              R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </strong>
          </div>
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.descricao}</div>
                    </td>
                    <td className="px-4 py-3">{formatDate(r.data_vencimento)}</td>
                    <td className="px-4 py-3 text-right">
                      R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <APRowActions
                        row={{
                          id: r.id,
                          status: r.status,
                          data_pagamento: r.data_pagamento ?? null,
                        }}
                        contas={contas}
                        actions={{ aprovar, pagar, cancelar }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
