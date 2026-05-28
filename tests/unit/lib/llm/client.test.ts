import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('LLM client (mock mode)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.LLM_MODE = 'mock'
  })

  it('classifyCategoria returns mock suggestion', async () => {
    const { classifyCategoria } = await import('@/lib/llm/client')
    const result = await classifyCategoria({
      descricao: 'AWS *Cloud Services',
      valor: 500,
      categorias: [{ id: 'cat-1', nome: 'Cloud' }, { id: 'cat-2', nome: 'Aluguel' }],
      exemplosSimilares: [],
    })
    expect(result.categoria_id).toBeTypeOf('string')
    expect(result.confianca).toBeGreaterThanOrEqual(0)
    expect(result.confianca).toBeLessThanOrEqual(1)
    expect(result.justificativa.length).toBeGreaterThan(0)
  })

  it('classifyBreak returns valid taxonomy class', async () => {
    const { classifyBreak } = await import('@/lib/llm/client')
    const result = await classifyBreak({
      lancamento: { id: 'l1', valor: 100, data: '2026-05-10', descricao: 'Pix recebido' },
      candidatos: [
        { id: 'ap1', tipo: 'ar', valor: 100, data: '2026-05-09', descricao: 'AR contrato cliente X' },
      ],
    })
    expect([
      'matched', 'timing-break', 'amount-break', 'mapping-issue',
      'duplicate', 'bank-only', 'ledger-only',
    ]).toContain(result.classificacao)
  })
})
