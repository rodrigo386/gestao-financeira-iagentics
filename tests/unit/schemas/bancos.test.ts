import { describe, it, expect } from 'vitest'
import { NewRegra } from '@/lib/schemas/regra'
import { NewSugestao } from '@/lib/schemas/sugestao'
import { NewPluggyItem } from '@/lib/schemas/pluggy-item'

describe('NewRegra', () => {
  const valid = {
    pattern: 'AWS',
    pattern_tipo: 'contains' as const,
    campo: 'descricao' as const,
    categoria_id: '550e8400-e29b-41d4-a716-446655440000',
  }
  it('accepts valid', () => {
    expect(NewRegra.safeParse(valid).success).toBe(true)
  })
  it('requires non-empty pattern', () => {
    expect(NewRegra.safeParse({ ...valid, pattern: '' }).success).toBe(false)
  })
})

describe('NewSugestao', () => {
  const valid = {
    lancamento_id: '550e8400-e29b-41d4-a716-446655440000',
    candidato_tipo: 'ap' as const,
    candidato_id: '550e8400-e29b-41d4-a716-446655440001',
    break_tipo: 'timing-break' as const,
    score: 0.75,
  }
  it('accepts valid', () => {
    expect(NewSugestao.safeParse(valid).success).toBe(true)
  })
  it('rejects score > 1', () => {
    expect(NewSugestao.safeParse({ ...valid, score: 1.5 }).success).toBe(false)
  })
  it('rejects negative score', () => {
    expect(NewSugestao.safeParse({ ...valid, score: -0.1 }).success).toBe(false)
  })
})

describe('NewPluggyItem', () => {
  it('accepts valid', () => {
    expect(NewPluggyItem.safeParse({
      pluggy_item_id: 'pl-abc-123', banco_nome: 'Itaú', status: 'updated',
    }).success).toBe(true)
  })
  it('rejects empty pluggy_item_id', () => {
    expect(NewPluggyItem.safeParse({
      pluggy_item_id: '', banco_nome: 'Itaú', status: 'updated',
    }).success).toBe(false)
  })
})
