import type { Drivers, Projecao } from '@/lib/schemas/cenario'

export type ForecastSnapshot = {
  mrrAtual: number
  caixaAtual: number
  despesaMensalAtual: number
  arPrevisto30d: number
  apPrevisto30d: number
  contratosAtivos: number
}

/**
 * Pure projection engine. Returns horizonMeses entries from startMes (inclusive).
 *
 * Forward model:
 *   mrr[t]            = mrr[t-1] * (1 - churn/100) + novos_clientes * ticket_medio
 *   receita_projeto[t] = sum(projetos started at t..t-(duracao-1))) * (valor / duracao)
 *   receita[t]        = mrr[t] + receita_projeto[t]
 *   despesa[t]        = despesa_atual * (1 + crescimento/100)^(t+1)
 *   caixa[t]          = caixa[t-1] + receita[t] - despesa[t]   (caixa[-1] = caixaAtual)
 *   runway            = first t where caixa[t] < 0, OR null if caixa stays >= 0
 *                       The runway field is the SAME for every projection row (it's a horizon-wide metric).
 */
export function gerarForecast(
  snapshot: ForecastSnapshot,
  drivers: Drivers,
  startMes: string,
  horizonMeses: number,
): Projecao[] {
  const out: Projecao[] = []
  let mrr = snapshot.mrrAtual
  let caixa = snapshot.caixaAtual

  // Pass 1: compute MRR / receita_projeto / despesa / caixa per month
  for (let t = 0; t < horizonMeses; t++) {
    // MRR evolution
    mrr = mrr * (1 - drivers.churn_pct / 100) + drivers.novos_clientes_mes * drivers.ticket_medio_novo

    // Projeto revenue: sum contributions from each active cohort
    let receitaProjeto = 0
    for (let cohort = Math.max(0, t - drivers.duracao_projeto_meses + 1); cohort <= t; cohort++) {
      // cohort started at month `cohort`; current month is `t`
      receitaProjeto += drivers.novos_projetos_mes * (drivers.valor_medio_projeto / drivers.duracao_projeto_meses)
    }

    const receita = mrr + receitaProjeto
    const despesa = snapshot.despesaMensalAtual * Math.pow(1 + drivers.crescimento_despesa_pct / 100, t + 1)
    caixa = caixa + receita - despesa

    out.push({
      cenario_id: '',  // filled by caller
      mes_ref: addMonths(startMes, t),
      mrr: round2(mrr),
      receita_total: round2(receita),
      despesa_total: round2(despesa),
      caixa: round2(caixa),
      runway_meses: null,  // computed in pass 2
    })
  }

  // Pass 2: compute runway (horizon-wide metric)
  let runway: number | null = null
  for (let t = 0; t < out.length; t++) {
    if (out[t]!.caixa < 0) {
      runway = t
      break
    }
  }
  for (const p of out) p.runway_meses = runway

  return out
}

function addMonths(dateStr: string, months: number): string {
  const parts = dateStr.split('-').map(Number)
  const y0 = parts[0]!
  const m0 = parts[1]!
  const total = (y0 * 12) + (m0 - 1) + months
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
