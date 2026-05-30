import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Button } from '@/components/ui/button'
import { TendenciaChart } from '@/components/tendencia-chart'
import { BrandLogo } from '@/components/brand-logo'
import { loadSnapshot } from '@/modules/forecast/snapshot'

const SEV_LABEL: Record<string, { cls: string; txt: string }> = {
  info: { cls: 'border-[var(--brand-blue)]/40 text-[var(--brand-blue)]', txt: 'info' },
  warning: { cls: 'border-amber-400/40 text-amber-400', txt: 'atenção' },
  critical: { cls: 'border-rose-400/40 text-rose-400', txt: 'crítico' },
}
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function brl(n: number): string {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function primeiroDiaMesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function addMesesPrimeiroDia(mesRef: string, months: number): string {
  const [y, m] = mesRef.split('-').map(Number)
  const total = y! * 12 + (m! - 1) + months
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}
function labelMes(mesRef: string): string {
  const [y, m] = mesRef.split('-').map(Number)
  return `${MESES_PT[m! - 1]}/${y}`
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: usuario } = await supabase
    .from('usuarios').select('nome, role').eq('id', user!.id).single()
  const isAdmin = usuario?.role === 'admin'

  const mesAtual = primeiroDiaMesAtual()
  const mesAFechar = addMesesPrimeiroDia(mesAtual, -1)

  // KPIs ao vivo
  const snap = await loadSnapshot(mesAtual)
  const burn = snap.despesaMensalAtual
  // Runway do cenário Base (já calculado pelo forecast)
  const { data: baseCenario } = await supabase
    .from('forecast_cenarios').select('id').eq('nome', 'Base').maybeSingle()
  let runwayBase: number | null = null
  if (baseCenario) {
    const { data: proj } = await supabase
      .from('forecast_projecoes').select('runway_meses').eq('cenario_id', baseCenario.id).limit(1).maybeSingle()
    runwayBase = proj?.runway_meses ?? null
  }

  // Tendência (meses fechados)
  const { data: mensais } = await supabase
    .from('metricas_mensais').select('*').order('mes_ref', { ascending: true })
  const fechados = mensais ?? []
  const tendencia = fechados.map((m) => ({
    mes: (m.mes_ref as string).slice(0, 7),
    MRR: Number(m.mrr),
    Caixa: Number(m.caixa_fim),
  }))
  const ultimoFechado = fechados.length ? fechados[fechados.length - 1] : null

  // MoM delta de MRR (real): MRR ao vivo vs. último mês fechado
  const mrrAnterior = ultimoFechado ? Number(ultimoFechado.mrr) : null
  const mrrDelta = mrrAnterior !== null ? snap.mrrAtual - mrrAnterior : null
  const mrrDeltaPct = mrrAnterior ? (mrrDelta! / mrrAnterior) * 100 : null

  // Alertas recentes não-lidos (critical/warning primeiro)
  const { data: alertas } = await supabase
    .from('alertas').select('*').eq('lido', false).order('criado_em', { ascending: false }).limit(50)
  const ordemSev: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  const alertasTop = (alertas ?? [])
    .sort((a, b) => (ordemSev[a.severidade as string] ?? 3) - (ordemSev[b.severidade as string] ?? 3))
    .slice(0, 5)

  async function fecharMesAction() {
    'use server'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) throw new Error('not authenticated')
    const { data: me } = await sb.from('usuarios').select('role').eq('id', u.id).single()
    if (me?.role !== 'admin') throw new Error('apenas admin pode fechar o mês')
    const alvo = addMesesPrimeiroDia(primeiroDiaMesAtual(), -1)
    const { fecharMes } = await import('@/modules/metricas/fechamento')
    await fecharMes(alvo, u.id)
    revalidatePath('/')
  }

  const destaques = (Array.isArray(ultimoFechado?.commentary_destaques)
    ? (ultimoFechado!.commentary_destaques as { linha: string; driver: string; magnitude: string }[])
    : [])

  return (
    <div className="dark terminal-surface text-foreground rounded-2xl border border-border overflow-hidden">
      {/* ticker */}
      <div className="flex items-center gap-6 overflow-x-auto border-b border-border px-5 h-11 font-mono text-xs text-muted-foreground">
        <span className="size-1.5 flex-none rounded-full bg-[var(--brand-blue)] shadow-[0_0_10px_var(--brand-violet)]"
          style={{ animation: 'brand-pulse 1.8s infinite' }} />
        <Tk k="MRR" v={brl(snap.mrrAtual)} />
        <Tk k="CAIXA" v={brl(snap.caixaAtual)} />
        <Tk k="RUNWAY" v={runwayBase === null ? '> 36m' : `${runwayBase}m`} />
        <Tk k="BURN" v={brl(burn)} />
        <Tk k="AR 30D" v={brl(snap.arPrevisto30d)} />
        <Tk k="CONTRATOS" v={String(snap.contratosAtivos)} />
      </div>

      <div className="p-6 space-y-5">
        {/* header */}
        <div className="flex flex-wrap items-center gap-4 animate-rise">
          <BrandLogo size={30} />
          <span className="font-mono text-[10px] font-bold tracking-[0.22em] text-[var(--brand-blue)] border border-border rounded px-2 py-1">
            // FIN · TERMINAL
          </span>
          <div className="ml-auto text-right">
            <div className="text-sm text-muted-foreground">A primeira força de trabalho de IA para aquisição</div>
            <div className="mt-0.5 font-mono text-[11px] tracking-wider text-muted-foreground/70">
              PAINEL EXECUTIVO · {labelMes(mesAtual).toUpperCase()} · {usuario?.nome ?? user!.email} ({usuario?.role ?? '?'})
            </div>
          </div>
        </div>
        <div className="h-0.5 rounded brand-grad-bg opacity-80" />

        {/* KPI grid — hairline cells */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3 lg:grid-cols-6">
          <Kpi i={0} label="MRR" value={brl(snap.mrrAtual)}
            sub={mrrDelta !== null ? `${mrrDelta >= 0 ? '▲' : '▼'} ${brl(Math.abs(mrrDelta))}${mrrDeltaPct !== null ? ` · ${mrrDeltaPct >= 0 ? '+' : ''}${mrrDeltaPct.toFixed(1)}%` : ''}` : 'sem base m/m'}
            tone={mrrDelta !== null && mrrDelta < 0 ? 'down' : 'up'} />
          <Kpi i={1} label="ARR" value={brl(snap.mrrAtual * 12)} sub="proj. 12m" />
          <Kpi i={2} label="Caixa" value={brl(snap.caixaAtual)} sub="atual consolidado" />
          <Kpi i={3} label="Runway" value={runwayBase === null ? '> 36 meses' : `${runwayBase} meses`} sub="cenário base" flag />
          <Kpi i={4} label="Burn líq." value={brl(burn)} sub="média / mês" />
          <Kpi i={5} label="Contratos" value={String(snap.contratosAtivos)} sub="ativos · meta 10" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          {/* tendência */}
          <Panel title="Tendência · meses fechados" tag="MRR / CAIXA">
            {tendencia.length < 2
              ? <Empty>Feche ao menos 2 meses para ver a tendência.</Empty>
              : <TendenciaChart rows={tendencia} />}
          </Panel>

          {/* comentário IA */}
          <Panel title={`Comentário IA${ultimoFechado ? ` · ${labelMes(ultimoFechado.mes_ref as string)}` : ''}`} tag="MoM">
            {!ultimoFechado || !ultimoFechado.commentary_resumo
              ? <Empty>Nenhum mês fechado ainda.</Empty>
              : (
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed text-foreground/85">{ultimoFechado.commentary_resumo as string}</p>
                  {destaques.length > 0 && (
                    <div className="grid gap-2">
                      {destaques.map((d, i) => (
                        <div key={i} className="flex items-baseline gap-2 border-t border-dashed border-border pt-2 text-xs">
                          <span className="brand-grad-text min-w-[110px] font-semibold uppercase tracking-wide">{d.linha}</span>
                          <span className="text-muted-foreground">{d.driver}</span>
                          <span className="ml-auto terminal-tabular text-[var(--brand-blue)]">{d.magnitude}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
          </Panel>
        </div>

        {/* alertas */}
        <Panel title="Alertas recentes" tag={`${alertasTop.length} não lidos`}>
          {alertasTop.length === 0
            ? <Empty>Nenhum alerta não-lido.</Empty>
            : (
              <div className="space-y-2">
                {alertasTop.map((a) => {
                  const sev = SEV_LABEL[a.severidade as string] ?? SEV_LABEL.info
                  return (
                    <div key={a.id} className="flex items-center gap-3 rounded-md border border-border bg-secondary/60 px-3 py-2.5 text-sm">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${sev!.cls}`}>{sev!.txt}</span>
                      <span className="font-medium">{a.titulo}</span>
                      <span className="text-muted-foreground">— {a.mensagem}</span>
                    </div>
                  )
                })}
                <a href="/alertas" className="inline-block text-sm text-primary underline">Ver todos →</a>
              </div>
            )}
        </Panel>

        {/* fechamento (admin) */}
        {isAdmin && (
          <Panel title="Fechamento mensal">
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Último fechado: <span className="text-foreground">{ultimoFechado ? labelMes(ultimoFechado.mes_ref as string) : '—'}</span>
              </p>
              <form action={fecharMesAction} className="ml-auto">
                <Button type="submit">Fechar mês {labelMes(mesAFechar)}</Button>
              </form>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

function Tk({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex-none whitespace-nowrap">
      {k} <b className="text-foreground terminal-tabular">{v}</b>
    </span>
  )
}

function Kpi({ i, label, value, sub, tone, flag }: {
  i: number; label: string; value: string; sub?: string; tone?: 'up' | 'down'; flag?: boolean
}) {
  return (
    <div className="relative bg-card p-4 animate-rise" style={{ animationDelay: `${i * 0.05}s` }}>
      {flag && <span className="absolute inset-y-0 left-0 w-0.5 brand-grad-bg" />}
      <div className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2.5 terminal-tabular text-[22px] font-bold tracking-tight">{value}</div>
      {sub && (
        <div className={`mt-1.5 terminal-tabular text-[11px] ${tone === 'up' ? 'text-[var(--brand-blue)]' : tone === 'down' ? 'text-rose-400' : 'text-muted-foreground'}`}>{sub}</div>
      )}
    </div>
  )
}

function Panel({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <section className="animate-rise rounded-lg border border-border bg-card p-[18px]">
      <div className="flex items-center gap-2 font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
        {tag && <span className="ml-auto rounded border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-[var(--brand-blue)]">{tag}</span>}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
