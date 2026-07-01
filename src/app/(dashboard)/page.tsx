import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BrandLogo } from '@/components/brand-logo'

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function brl(n: number): string {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: usuario } = await supabase
    .from('usuarios').select('nome').eq('id', user!.id).single()

  const hoje = new Date()
  const y = hoje.getFullYear()
  const m = hoje.getMonth() + 1
  const inicioMes = `${y}-${String(m).padStart(2, '0')}-01`
  const fimMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

  const [contas, entradas, saidas, ar, ap, contratos] = await Promise.all([
    supabase.from('contas_bancarias').select('saldo_atual').eq('ativa', true),
    supabase.from('lancamentos').select('valor').eq('tipo', 'entrada').gte('data', inicioMes).lte('data', fimMes),
    supabase.from('lancamentos').select('valor').eq('tipo', 'saida').gte('data', inicioMes).lte('data', fimMes),
    supabase.from('contas_a_receber').select('valor').in('status', ['previsto', 'emitido', 'atrasado']),
    supabase.from('contas_a_pagar').select('valor').in('status', ['previsto', 'aprovado', 'atrasado']),
    supabase.from('contratos').select('ticket, tipo').eq('status', 'ativo'),
  ])

  const sum = (rows: { valor: number }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.valor), 0)
  const caixa = (contas.data ?? []).reduce((s, r) => s + Number(r.saldo_atual), 0)
  const entrou = sum(entradas.data as { valor: number }[] | null)
  const saiu = sum(saidas.data as { valor: number }[] | null)
  const resultado = entrou - saiu
  const aReceber = sum(ar.data as { valor: number }[] | null)
  const aPagar = sum(ap.data as { valor: number }[] | null)
  const mrr = (contratos.data ?? []).reduce(
    (s, c) => s + (c.tipo === 'anual' ? Number(c.ticket) / 12 : Number(c.ticket)),
    0,
  )

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center gap-4">
        <BrandLogo size={28} />
        <div>
          <h1 className="text-2xl font-semibold">Olá, {usuario?.nome ?? 'bem-vindo'}</h1>
          <p className="text-sm text-muted-foreground">Resumo de {MESES_PT[m - 1]} de {y}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Link
            href="/despesas/lancamentos/novo?tipo=entrada"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            + Entrada
          </Link>
          <Link
            href="/despesas/lancamentos/novo?tipo=saida"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            + Saída
          </Link>
        </div>
      </div>

      {/* saldo em destaque */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Saldo em caixa</div>
        <div className="mt-1 text-4xl font-bold">{brl(caixa)}</div>
      </div>

      {/* este mês */}
      <div>
        <div className="mb-2 text-sm font-semibold text-muted-foreground">Este mês</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Entrou" value={brl(entrou)} tone="up" />
          <StatCard label="Saiu" value={brl(saiu)} tone="down" />
          <StatCard label="Resultado" value={brl(resultado)} tone={resultado >= 0 ? 'up' : 'down'} strong />
        </div>
      </div>

      {/* em aberto + mrr */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <LinkCard href="/contas-receber" label="A receber (em aberto)" value={brl(aReceber)} />
        <LinkCard href="/contas-pagar" label="A pagar (em aberto)" value={brl(aPagar)} />
        <StatCard label="MRR (receita recorrente)" value={brl(mrr)} />
      </div>
    </div>
  )
}

function StatCard({ label, value, tone, strong }: {
  label: string; value: string; tone?: 'up' | 'down'; strong?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={
        `mt-1 font-bold ${strong ? 'text-2xl' : 'text-xl'} ` +
        (tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-rose-400' : '')
      }>
        {value}
      </div>
    </div>
  )
}

function LinkCard({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link href={href} className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-primary">ver →</div>
    </Link>
  )
}
