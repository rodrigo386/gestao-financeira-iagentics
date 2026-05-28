import { describe, it, expect } from 'vitest'
import { gerarForecast, type ForecastSnapshot } from '@/modules/forecast/engine'
import type { Drivers } from '@/lib/schemas/cenario'

const baseSnapshot: ForecastSnapshot = {
  mrrAtual: 5000,            // R$ 5k MRR
  caixaAtual: 100000,        // R$ 100k caixa
  despesaMensalAtual: 10000, // R$ 10k/mês despesa
  arPrevisto30d: 0,
  apPrevisto30d: 0,
  contratosAtivos: 5,
}

const baseDrivers: Drivers = {
  novos_clientes_mes: 1,
  churn_pct: 2,
  ticket_medio_novo: 1500,
  novos_projetos_mes: 0,
  valor_medio_projeto: 0,
  duracao_projeto_meses: 3,
  crescimento_despesa_pct: 1,
}

describe('gerarForecast', () => {
  it('returns 12 months', () => {
    const r = gerarForecast(baseSnapshot, baseDrivers, '2026-06-01', 12)
    expect(r).toHaveLength(12)
    expect(r[0]!.mes_ref).toBe('2026-06-01')
    expect(r[11]!.mes_ref).toBe('2027-05-01')
  })

  it('MRR evolves: mes 1 = mrrAtual*(1-churn/100) + novos*ticket', () => {
    const r = gerarForecast(baseSnapshot, baseDrivers, '2026-06-01', 2)
    // mrr[0] = 5000*(1-0.02) + 1*1500 = 4900 + 1500 = 6400
    expect(r[0]!.mrr).toBeCloseTo(6400, 1)
    // mrr[1] = 6400*0.98 + 1500 = 6272 + 1500 = 7772
    expect(r[1]!.mrr).toBeCloseTo(7772, 1)
  })

  it('despesa grows at crescimento_despesa_pct compounded', () => {
    const r = gerarForecast(baseSnapshot, baseDrivers, '2026-06-01', 3)
    // despesa[0] = 10000 * 1.01 = 10100
    expect(r[0]!.despesa_total).toBeCloseTo(10100, 1)
    // despesa[1] = 10000 * 1.01^2 = 10201
    expect(r[1]!.despesa_total).toBeCloseTo(10201, 1)
  })

  it('caixa accumulates receita - despesa from caixaAtual', () => {
    const r = gerarForecast(baseSnapshot, baseDrivers, '2026-06-01', 1)
    // caixa[0] = 100000 + (6400 receita) - (10100 despesa) = 96300
    expect(r[0]!.caixa).toBeCloseTo(96300, 1)
  })

  it('runway becomes null when caixa stays > 0 for full horizon', () => {
    const snap = { ...baseSnapshot, caixaAtual: 1_000_000 }
    const r = gerarForecast(snap, baseDrivers, '2026-06-01', 12)
    expect(r[0]!.runway_meses).toBeNull()
  })

  it('runway returns # of months until caixa < 0', () => {
    const snap = { ...baseSnapshot, caixaAtual: 5000 }  // small caixa — goes negative at month 1
    const r = gerarForecast(snap, baseDrivers, '2026-06-01', 12)
    // Negative caixa starting at some month
    const firstNeg = r.findIndex((p) => p.caixa < 0)
    expect(firstNeg).toBeGreaterThan(0)
    expect(r[0]!.runway_meses).toBe(firstNeg)
  })

  it('includes projeto revenue distributed over duracao_projeto_meses', () => {
    const drivers = { ...baseDrivers, novos_projetos_mes: 1, valor_medio_projeto: 30000, duracao_projeto_meses: 3 }
    const r = gerarForecast(baseSnapshot, drivers, '2026-06-01', 4)
    // mes 1: 1 novo projeto, primeiro mes = 30000/3 = 10000
    // mes 2: 1 novo projeto novamente + 2o mes do anterior = 10000 + 10000 = 20000
    // mes 3: 1 novo + 2o do mes 2 + 3o do mes 1 = 10000 + 10000 + 10000 = 30000
    // receita = mrr + receita_projeto
    const projeto0 = r[0]!.receita_total - r[0]!.mrr
    expect(projeto0).toBeCloseTo(10000, 1)
    const projeto2 = r[2]!.receita_total - r[2]!.mrr
    expect(projeto2).toBeCloseTo(30000, 1)
  })
})
