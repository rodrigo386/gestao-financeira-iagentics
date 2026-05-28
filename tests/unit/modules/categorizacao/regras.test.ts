import { describe, it, expect } from 'vitest'
import { matchRegras } from '@/modules/categorizacao/regras'
import type { Regra } from '@/lib/schemas/regra'

function regra(p: Partial<Regra>): Regra {
  return {
    id: crypto.randomUUID(),
    prioridade: 100,
    pattern: 'AWS',
    pattern_tipo: 'contains',
    campo: 'descricao',
    categoria_id: 'cat-1',
    fornecedor_id: undefined,
    origem: 'manual',
    ativa: true,
    total_aplicacoes: 0,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...p,
  }
}

describe('matchRegras', () => {
  it('returns null when no regras', () => {
    expect(matchRegras([], 'descricao qualquer', undefined)).toBeNull()
  })

  it('matches contains pattern', () => {
    const r = regra({ pattern: 'AWS', pattern_tipo: 'contains' })
    const result = matchRegras([r], 'AWS *Cloud Services', undefined)
    expect(result?.id).toBe(r.id)
  })

  it('contains is case insensitive', () => {
    const r = regra({ pattern: 'aws', pattern_tipo: 'contains' })
    const result = matchRegras([r], 'AWS *Cloud', undefined)
    expect(result?.id).toBe(r.id)
  })

  it('matches starts_with', () => {
    const r = regra({ pattern: 'PIX', pattern_tipo: 'starts_with' })
    expect(matchRegras([r], 'PIX recebido', undefined)?.id).toBe(r.id)
    expect(matchRegras([r], 'Recebido via PIX', undefined)).toBeNull()
  })

  it('matches exact', () => {
    const r = regra({ pattern: 'IOF', pattern_tipo: 'exact' })
    expect(matchRegras([r], 'IOF', undefined)?.id).toBe(r.id)
    expect(matchRegras([r], 'IOF cobrado', undefined)).toBeNull()
  })

  it('matches regex', () => {
    const r = regra({ pattern: '^AWS.*Cloud$', pattern_tipo: 'regex' })
    expect(matchRegras([r], 'AWS Mega Cloud', undefined)?.id).toBe(r.id)
  })

  it('respects prioridade order (higher first)', () => {
    const r1 = regra({ pattern: 'AWS', prioridade: 50, categoria_id: 'cat-low' })
    const r2 = regra({ pattern: 'AWS', prioridade: 200, categoria_id: 'cat-hi' })
    const result = matchRegras([r1, r2], 'AWS Cloud', undefined)
    expect(result?.categoria_id).toBe('cat-hi')
  })

  it('skips ativa=false', () => {
    const r = regra({ pattern: 'AWS', ativa: false })
    expect(matchRegras([r], 'AWS Cloud', undefined)).toBeNull()
  })

  it('matches campo=fornecedor_nome when fornecedor passed', () => {
    const r = regra({ pattern: 'Amazon', campo: 'fornecedor_nome' })
    expect(matchRegras([r], 'descricao qualquer', 'Amazon Web Services')?.id).toBe(r.id)
    expect(matchRegras([r], 'descricao qualquer', 'Microsoft')).toBeNull()
  })
})
