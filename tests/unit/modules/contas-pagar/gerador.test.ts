import { describe, it, expect } from 'vitest'
import { gerarAPDeRecorrente, proximaGeracao } from '@/modules/contas-pagar/gerador'
import type { DespesaRecorrente } from '@/lib/schemas/despesa_recorrente'

const baseRecorrente: DespesaRecorrente = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  fornecedor_id: '550e8400-e29b-41d4-a716-446655440002',
  descricao: 'AWS Cloud',
  valor: 500,
  moeda: 'BRL',
  dia_mes: 10,
  categoria_id: undefined,
  data_inicio: '2026-01-01',
  data_fim: undefined,
  ativa: true,
  proxima_geracao: '2026-05-01',
  observacoes: undefined,
  criado_em: '2026-01-01T00:00:00Z',
  atualizado_em: '2026-01-01T00:00:00Z',
}

describe('gerarAPDeRecorrente', () => {
  it('generates AP with correct fields for an active recurring expense', () => {
    const ap = gerarAPDeRecorrente(baseRecorrente, '2026-05-01')
    expect(ap).not.toBeNull()
    expect(ap!.tipo_credor).toBe('fornecedor')
    expect(ap!.credor_id).toBe(baseRecorrente.fornecedor_id)
    expect(ap!.origem).toBe('recorrente')
    expect(ap!.origem_id).toBe(baseRecorrente.id)
    expect(ap!.valor).toBe(500)
    expect(ap!.descricao).toBe('AWS Cloud')
    expect(ap!.data_vencimento).toBe('2026-05-10')
    expect(ap!.status).toBe('previsto')
  })

  it('returns null for inactive recurring', () => {
    expect(gerarAPDeRecorrente({ ...baseRecorrente, ativa: false }, '2026-05-01')).toBeNull()
  })

  it('returns null when start date is after reference month', () => {
    expect(gerarAPDeRecorrente({ ...baseRecorrente, data_inicio: '2026-06-01' }, '2026-05-01')).toBeNull()
  })

  it('returns null when end date is before reference month', () => {
    expect(gerarAPDeRecorrente({ ...baseRecorrente, data_fim: '2026-04-30' }, '2026-05-01')).toBeNull()
  })
})

describe('proximaGeracao', () => {
  it('advances by one month preserving dia_mes', () => {
    expect(proximaGeracao('2026-05-01', 10)).toBe('2026-06-10')
  })

  it('handles year rollover', () => {
    expect(proximaGeracao('2026-12-01', 5)).toBe('2027-01-05')
  })
})
