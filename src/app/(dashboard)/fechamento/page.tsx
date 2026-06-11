import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { withAudit } from '@/lib/audit'
import { gerarARMes } from '@/modules/contas-receber/ar'
import { gerarAPMes } from '@/modules/contas-pagar/ap'
import { GerarMesButton, type GerarMesResult } from '@/components/gerar-mes-button'

function fmtBRL(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function FechamentoPage() {
  const supabase = await createClient()

  const mes = new Date().toISOString().slice(0, 7) // YYYY-MM (mês atual)
  const inicio = `${mes}-01`
  const parts = mes.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) // último dia do mês

  // Status ao vivo (mês corrente)
  const [pend, ar, ap] = await Promise.all([
    supabase.from('lancamentos').select('id', { count: 'exact', head: true })
      .or('categoria_id.is.null,and(categorizacao_metodo.eq.llm,categorizacao_confianca.lt.0.7)'),
    supabase.from('contas_a_receber').select('valor', { count: 'exact' })
      .gte('data_vencimento', inicio).lte('data_vencimento', fim)
      .in('status', ['previsto', 'emitido', 'atrasado']),
    supabase.from('contas_a_pagar').select('valor', { count: 'exact' })
      .gte('data_vencimento', inicio).lte('data_vencimento', fim)
      .in('status', ['previsto', 'aprovado', 'atrasado']),
  ])

  const pendCount = pend.count ?? 0
  const arCount = ar.count ?? 0
  const arTotal = (ar.data ?? []).reduce((s, r) => s + Number(r.valor), 0)
  const apCount = ap.count ?? 0
  const apTotal = (ap.data ?? []).reduce((s, r) => s + Number(r.valor), 0)

  async function gerarARAction(month: string): Promise<GerarMesResult> {
    'use server'
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('mês inválido')
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) throw new Error('não autenticado')
    const { data: u } = await sb.from('usuarios').select('role').eq('id', user.id).single()
    if (!u || !['admin', 'financeiro'].includes(u.role)) throw new Error('sem permissão para gerar AR')
    const refMonth = `${month}-01`
    const result = await withAudit(
      { usuario_id: user.id, acao: 'custom', tabela: 'contas_a_receber', registro_id: refMonth,
        before: null, after: { mes_ref: refMonth }, motivo: 'gerar AR do mês (fechamento)' },
      async () => gerarARMes(refMonth),
    )
    revalidatePath('/fechamento')
    revalidatePath('/contas-receber')
    return result
  }

  async function gerarAPAction(month: string): Promise<GerarMesResult> {
    'use server'
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('mês inválido')
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) throw new Error('não autenticado')
    const { data: u } = await sb.from('usuarios').select('role').eq('id', user.id).single()
    if (!u || !['admin', 'financeiro'].includes(u.role)) throw new Error('sem permissão para gerar AP')
    const refMonth = `${month}-01`
    const result = await withAudit(
      { usuario_id: user.id, acao: 'custom', tabela: 'contas_a_pagar', registro_id: refMonth,
        before: null, after: { mes_ref: refMonth }, motivo: 'gerar AP do mês (fechamento)' },
      async () => gerarAPMes(refMonth),
    )
    revalidatePath('/fechamento')
    revalidatePath('/contas-pagar')
    return result
  }

  const passos = [
    { n: 2, titulo: 'Registrar recebimentos', desc: 'Marque como recebido o que entrou.', href: '/contas-receber', cta: 'Contas a Receber' },
    { n: 3, titulo: 'Registrar pagamentos', desc: 'Aprove e marque como pago o que saiu.', href: '/contas-pagar', cta: 'Contas a Pagar' },
    { n: 4, titulo: 'Resolver pendências', desc: pendCount > 0 ? `${pendCount} lançamento(s) sem categoria.` : 'Tudo categorizado.', href: '/pendencias', cta: 'Pendências' },
    { n: 5, titulo: 'Conferir DRE e fluxo', desc: 'Resultado do mês e caixa.', href: '/relatorios', cta: 'Relatórios' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fechamento do mês</h1>
        <p className="text-sm text-muted-foreground">Rotina mensal em uma tela — referência: {mes}</p>
      </div>

      {/* Status ao vivo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">A receber no mês</div>
          <div className="mt-1 text-lg font-semibold">{fmtBRL(arTotal)}</div>
          <div className="text-xs text-muted-foreground">{arCount} conta(s)</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">A pagar no mês</div>
          <div className="mt-1 text-lg font-semibold">{fmtBRL(apTotal)}</div>
          <div className="text-xs text-muted-foreground">{apCount} conta(s)</div>
        </div>
        <div className={'rounded-lg border p-4 ' + (pendCount > 0 ? 'border-amber-400/40 bg-amber-400/10' : 'border-border bg-card')}>
          <div className="text-xs text-muted-foreground">Pendências de categorização</div>
          <div className="mt-1 text-lg font-semibold">{pendCount}</div>
          <div className="text-xs text-muted-foreground">{pendCount > 0 ? 'precisa de revisão' : 'tudo certo'}</div>
        </div>
      </div>

      {/* Passo 1: gerar previstos */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div>
          <div className="text-sm font-semibold">1 · Gerar previstos do mês</div>
          <p className="text-sm text-muted-foreground">
            AR dos contratos ativos e AP das despesas recorrentes. Idempotente — não duplica o que já existe.
          </p>
        </div>
        <GerarMesButton
          id="fechamento-ar"
          label="Gerar AR do mês"
          pendingLabel="Gerando AR..."
          onGerar={gerarARAction}
          formatMsg={(r) => `${r.inserted} AR gerada(s), ${r.skipped} já existia(m).`}
        />
        <GerarMesButton
          id="fechamento-ap"
          label="Gerar AP do mês"
          pendingLabel="Gerando AP..."
          onGerar={gerarAPAction}
          formatMsg={(r) => `${r.inserted} AP gerada(s), ${r.skipped} já existia(m).`}
        />
      </div>

      {/* Passos 2..5: atalhos */}
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {passos.map((p) => (
          <div key={p.n} className="flex items-center justify-between gap-4 p-4">
            <div>
              <div className="text-sm font-semibold">{p.n} · {p.titulo}</div>
              <p className="text-sm text-muted-foreground">{p.desc}</p>
            </div>
            <Link
              href={p.href}
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-primary hover:bg-accent"
            >
              {p.cta}
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
