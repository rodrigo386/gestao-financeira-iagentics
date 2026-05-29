import 'server-only'
import type { MetricasMes } from './snapshot'

export type LinhaKey = 'mrr' | 'receita_total' | 'despesa_total' | 'caixa_fim' | 'resultado'

export type LinhaVariancia = {
  linha: LinhaKey
  atual: number
  anterior: number
  delta: number
  delta_pct: number | null
  material: boolean
}

export type Thresholds = { pct: number; abs: number }

const LINHAS: LinhaKey[] = ['mrr', 'receita_total', 'despesa_total', 'caixa_fim', 'resultado']

const DEFAULT_THRESHOLDS: Thresholds = { pct: 5, abs: 50 }

/** Pure: variância mês-a-mês por linha, com flag de materialidade max(pct% do anterior, abs). */
export function montarLinhasVariancia(
  atual: MetricasMes,
  anterior: MetricasMes,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): LinhaVariancia[] {
  return LINHAS.map((linha) => {
    const a = atual[linha] as number
    const b = anterior[linha] as number
    const delta = round2(a - b)
    const delta_pct = b === 0 ? null : round2((delta / Math.abs(b)) * 100)
    const limite = Math.max(thresholds.abs, (thresholds.pct / 100) * Math.abs(b))
    return { linha, atual: a, anterior: b, delta, delta_pct, material: Math.abs(delta) >= limite }
  })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
