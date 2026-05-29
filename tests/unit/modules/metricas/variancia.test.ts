import { describe, it, expect } from 'vitest'
import { montarLinhasVariancia } from '@/modules/metricas/variancia'
import type { MetricasMes } from '@/modules/metricas/snapshot'

function mm(p: Partial<MetricasMes>): MetricasMes {
  return {
    mes_ref: '2026-04-01', mrr: 0, arr: 0, receita_total: 0, despesa_total: 0,
    resultado: 0, caixa_fim: 0, runway_meses: null, contratos_ativos: 0, churn_rate: 0, ...p,
  }
}

describe('montarLinhasVariancia', () => {
  it('calcula delta e delta_pct por linha', () => {
    const linhas = montarLinhasVariancia(mm({ mrr: 12000 }), mm({ mrr: 10000 }))
    const mrr = linhas.find((l) => l.linha === 'mrr')!
    expect(mrr.delta).toBe(2000)
    expect(mrr.delta_pct).toBeCloseTo(20)
    expect(mrr.material).toBe(true)
  })

  it('material exige |delta| >= max(5% do anterior, R$50)', () => {
    // 5% de 10000 = 500; delta 100 < 500 → não material
    const linhas = montarLinhasVariancia(mm({ mrr: 10100 }), mm({ mrr: 10000 }))
    expect(linhas.find((l) => l.linha === 'mrr')!.material).toBe(false)
    // delta 60 com anterior pequeno (200): 5% = 10, abs = 50 → max 50; 60 >= 50 → material
    const linhas2 = montarLinhasVariancia(mm({ receita_total: 260 }), mm({ receita_total: 200 }))
    expect(linhas2.find((l) => l.linha === 'receita_total')!.material).toBe(true)
  })

  it('delta_pct null quando anterior = 0', () => {
    const linhas = montarLinhasVariancia(mm({ despesa_total: 500 }), mm({ despesa_total: 0 }))
    const d = linhas.find((l) => l.linha === 'despesa_total')!
    expect(d.delta_pct).toBeNull()
    expect(d.material).toBe(true) // 500 >= max(50, 0)
  })

  it('cobre as 5 linhas', () => {
    const linhas = montarLinhasVariancia(mm({}), mm({}))
    expect(linhas.map((l) => l.linha).sort()).toEqual(
      ['caixa_fim', 'despesa_total', 'mrr', 'receita_total', 'resultado'],
    )
  })
})
