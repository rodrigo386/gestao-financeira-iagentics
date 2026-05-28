import { describe, it, expect } from 'vitest'
import { NewLancamento } from '@/lib/schemas/lancamento'
import { NewFornecedor } from '@/lib/schemas/fornecedor'
import { NewDespesaRecorrente } from '@/lib/schemas/despesa_recorrente'
import { NewContaAPagar } from '@/lib/schemas/ap'

describe('NewLancamento', () => {
  const valid = {
    data: '2026-05-15',
    valor: 100,
    conta_id: '550e8400-e29b-41d4-a716-446655440000',
    tipo: 'saida' as const,
    descricao: 'Pagamento aluguel',
    origem: 'manual' as const,
  }
  it('accepts valid lancamento', () => {
    expect(NewLancamento.safeParse(valid).success).toBe(true)
  })
  it('rejects zero valor', () => {
    expect(NewLancamento.safeParse({ ...valid, valor: 0 }).success).toBe(false)
  })
  it('rejects negative valor', () => {
    expect(NewLancamento.safeParse({ ...valid, valor: -1 }).success).toBe(false)
  })
})

describe('NewFornecedor', () => {
  it('requires nome', () => {
    expect(NewFornecedor.safeParse({}).success).toBe(false)
  })
  it('accepts minimal', () => {
    expect(NewFornecedor.safeParse({ nome: 'AWS' }).success).toBe(true)
  })
})

describe('NewDespesaRecorrente', () => {
  const valid = {
    fornecedor_id: '550e8400-e29b-41d4-a716-446655440000',
    descricao: 'AWS Cloud',
    valor: 500,
    dia_mes: 10,
    data_inicio: '2026-05-01',
    proxima_geracao: '2026-06-01',
  }
  it('accepts valid', () => {
    expect(NewDespesaRecorrente.safeParse(valid).success).toBe(true)
  })
  it('rejects dia_mes > 28', () => {
    expect(NewDespesaRecorrente.safeParse({ ...valid, dia_mes: 31 }).success).toBe(false)
  })
})

describe('NewContaAPagar', () => {
  const valid = {
    tipo_credor: 'fornecedor' as const,
    credor_id: '550e8400-e29b-41d4-a716-446655440000',
    origem: 'avulso' as const,
    descricao: 'Aluguel',
    valor: 5000,
    data_vencimento: '2026-05-15',
  }
  it('accepts valid', () => {
    expect(NewContaAPagar.safeParse(valid).success).toBe(true)
  })
  it('rejects negative valor', () => {
    expect(NewContaAPagar.safeParse({ ...valid, valor: -1 }).success).toBe(false)
  })
})
