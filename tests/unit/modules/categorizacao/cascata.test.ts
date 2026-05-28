import { describe, it, expect, vi, beforeEach } from 'vitest'
import { categorizar } from '@/modules/categorizacao/cascata'
import type { Regra } from '@/lib/schemas/regra'

// Mock the LLM client to avoid real API calls
vi.mock('@/lib/llm/client', () => ({
  classifyCategoria: vi.fn(async () => ({
    categoria_id: 'cat-llm',
    confianca: 0.8,
    justificativa: 'Mocked',
  })),
}))

const baseRegra: Regra = {
  id: 'r1', prioridade: 100, pattern: 'AWS', pattern_tipo: 'contains',
  campo: 'descricao', categoria_id: 'cat-regra', fornecedor_id: undefined,
  origem: 'manual', ativa: true, total_aplicacoes: 0,
  criado_em: '2026-01-01T00:00:00Z', atualizado_em: '2026-01-01T00:00:00Z',
}

describe('categorizar (cascata)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('regra wins when match exists', async () => {
    const result = await categorizar({
      descricao: 'AWS Cloud',
      valor: 100,
      regras: [baseRegra],
      historico: [],
      categorias: [{ id: 'cat-regra', nome: 'Cloud' }],
    })
    expect(result.categoria_id).toBe('cat-regra')
    expect(result.metodo).toBe('regra')
    expect(result.confianca).toBe(1.0)
  })

  it('historico wins when no regra but >=3 history entries', async () => {
    const history = [
      { descricao: 'Vercel A', categoria_id: 'cat-hist' },
      { descricao: 'Vercel B', categoria_id: 'cat-hist' },
      { descricao: 'Vercel C', categoria_id: 'cat-hist' },
    ]
    const result = await categorizar({
      descricao: 'Vercel D',
      valor: 50,
      regras: [],
      historico: history,
      categorias: [{ id: 'cat-hist', nome: 'Tech' }],
    })
    expect(result.categoria_id).toBe('cat-hist')
    expect(result.metodo).toBe('historico')
    expect(result.confianca).toBe(0.9)
  })

  it('falls through to LLM when no regra and no historico match', async () => {
    const result = await categorizar({
      descricao: 'Unknown vendor',
      valor: 100,
      regras: [],
      historico: [],
      categorias: [{ id: 'cat-llm', nome: 'Outros' }],
    })
    expect(result.categoria_id).toBe('cat-llm')
    expect(result.metodo).toBe('llm')
  })

  it('marks pendente when LLM confidence <= 0.7', async () => {
    const { classifyCategoria } = await import('@/lib/llm/client')
    vi.mocked(classifyCategoria).mockResolvedValueOnce({
      categoria_id: 'cat-uncertain', confianca: 0.5, justificativa: 'low',
    })

    const result = await categorizar({
      descricao: 'Algo estranho',
      valor: 999,
      regras: [],
      historico: [],
      categorias: [{ id: 'cat-uncertain', nome: 'X' }],
    })
    expect(result.metodo).toBe('llm')
    expect(result.pendente).toBe(true)
  })
})
