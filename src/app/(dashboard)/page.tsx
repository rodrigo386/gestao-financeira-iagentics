import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TendenciaChart } from '@/components/tendencia-chart'
import { loadSnapshot } from '@/modules/forecast/snapshot'

const SEV_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  info: 'secondary', warning: 'outline', critical: 'destructive',
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-neutral-600">Olá, <strong>{usuario?.nome ?? user!.email}</strong> ({usuario?.role ?? '?'}).</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi titulo="MRR" valor={brl(snap.mrrAtual)} />
        <Kpi titulo="Caixa atual" valor={brl(snap.caixaAtual)} />
        <Kpi titulo="Runway" valor={runwayBase === null ? '> 36 meses' : `${runwayBase} meses`} />
        <Kpi titulo="Burn mensal" valor={brl(burn)} />
        <Kpi titulo="AR (30d)" valor={brl(snap.arPrevisto30d)} />
        <Kpi titulo="Contratos ativos" valor={String(snap.contratosAtivos)} />
      </div>

      {/* Tendência */}
      <Card>
        <CardHeader><CardTitle>Tendência (meses fechados)</CardTitle></CardHeader>
        <CardContent>
          {tendencia.length < 2
            ? <p className="text-neutral-500 text-sm">Feche ao menos 2 meses para ver a tendência.</p>
            : <TendenciaChart rows={tendencia} />}
        </CardContent>
      </Card>

      {/* Comentário mensal IA */}
      <Card>
        <CardHeader><CardTitle>Comentário mensal IA{ultimoFechado ? ` — ${labelMes(ultimoFechado.mes_ref as string)}` : ''}</CardTitle></CardHeader>
        <CardContent>
          {!ultimoFechado || !ultimoFechado.commentary_resumo
            ? <p className="text-neutral-500 text-sm">Nenhum mês fechado ainda.</p>
            : (
              <div className="space-y-3">
                <p className="text-sm text-neutral-700">{ultimoFechado.commentary_resumo as string}</p>
                {Array.isArray(ultimoFechado.commentary_destaques) && (ultimoFechado.commentary_destaques as unknown[]).length > 0 && (
                  <ul className="text-sm text-neutral-600 list-disc pl-5 space-y-1">
                    {(ultimoFechado.commentary_destaques as { linha: string; driver: string; magnitude: string }[]).map((d, i) => (
                      <li key={i}><strong>{d.linha}</strong>: {d.driver} ({d.magnitude})</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
        </CardContent>
      </Card>

      {/* Alertas recentes */}
      <Card>
        <CardHeader><CardTitle>Alertas recentes</CardTitle></CardHeader>
        <CardContent>
          {alertasTop.length === 0
            ? <p className="text-neutral-500 text-sm">Nenhum alerta não-lido.</p>
            : (
              <div className="space-y-2">
                {alertasTop.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    <Badge variant={SEV_VARIANT[a.severidade as string]}>{a.severidade}</Badge>
                    <span className="font-medium">{a.titulo}</span>
                    <span className="text-neutral-500">— {a.mensagem}</span>
                  </div>
                ))}
                <a href="/alertas" className="text-sm text-blue-600 hover:underline">Ver todos →</a>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Fechamento (admin) */}
      {isAdmin && (
        <Card>
          <CardHeader><CardTitle>Fechamento mensal</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <p className="text-sm text-neutral-600">
              Último fechado: {ultimoFechado ? labelMes(ultimoFechado.mes_ref as string) : '—'}
            </p>
            <form action={fecharMesAction}>
              <Button type="submit">Fechar mês {labelMes(mesAFechar)}</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Kpi({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-neutral-500">{titulo}</div>
        <div className="text-xl font-semibold">{valor}</div>
      </CardContent>
    </Card>
  )
}
