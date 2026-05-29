import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { MetricasMes } from '@/modules/metricas/snapshot'

function mm(p: Partial<MetricasMes>): MetricasMes {
  return {
    mes_ref: '2026-04-01', mrr: 0, arr: 0, receita_total: 0, despesa_total: 0,
    resultado: 0, caixa_fim: 0, runway_meses: null, contratos_ativos: 0, churn_rate: 0, ...p,
  }
}

describe('gerarCommentary (mock LLM)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.LLM_MODE = 'mock'
  })

  it('sem mês anterior → resumo neutro, sem destaques', async () => {
    const { gerarCommentary } = await import('@/modules/metricas/commentary')
    const out = await gerarCommentary(mm({ mrr: 10000 }), null)
    expect(out.destaques).toEqual([])
    expect(out.resumo.toLowerCase()).toContain('primeiro mês')
  })

  it('sem variações materiais → resumo de estabilidade', async () => {
    const { gerarCommentary } = await import('@/modules/metricas/commentary')
    const out = await gerarCommentary(mm({ mrr: 10010 }), mm({ mrr: 10000 }))
    expect(out.destaques).toEqual([])
    expect(out.resumo.toLowerCase()).toContain('estável')
  })

  it('com variações materiais → chama LLM mock e retorna destaques', async () => {
    const { gerarCommentary } = await import('@/modules/metricas/commentary')
    const out = await gerarCommentary(mm({ mrr: 18000, despesa_total: 12000 }), mm({ mrr: 10000, despesa_total: 0 }))
    expect(out.destaques.length).toBeGreaterThan(0)
    expect(out.resumo.length).toBeGreaterThan(0)
  })
})
