import { describe, it, expect } from 'vitest'
import { calcularMRR, calcularARR, calcularChurnRate, calcularNRR } from '@/modules/receitas/metricas'
import type { Contrato } from '@/lib/schemas/contrato'

function contrato(p: Partial<Contrato>): Contrato {
  return {
    id: crypto.randomUUID(),
    cliente_id: crypto.randomUUID(),
    nome: 'Test',
    tipo: 'mensal',
    ticket: 1000,
    moeda: 'BRL',
    dia_cobranca: 1,
    data_inicio: '2026-01-01',
    data_fim: null,
    status: 'ativo',
    motivo_churn: null,
    data_churn: null,
    observacoes: null,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...p,
  }
}

describe('calcularMRR', () => {
  it('returns 0 when no contracts', () => {
    expect(calcularMRR([], '2026-05-01')).toBe(0)
  })

  it('sums monthly ticket of active contracts', () => {
    const result = calcularMRR(
      [contrato({ tipo: 'mensal', ticket: 1000 }), contrato({ tipo: 'mensal', ticket: 500 })],
      '2026-05-01',
    )
    expect(result).toBe(1500)
  })

  it('divides annual ticket by 12', () => {
    expect(calcularMRR([contrato({ tipo: 'anual', ticket: 12000 })], '2026-05-01')).toBe(1000)
  })

  it('excludes contracts that started after reference date', () => {
    expect(calcularMRR([contrato({ data_inicio: '2026-06-01' })], '2026-05-01')).toBe(0)
  })

  it('excludes contracts that ended before reference date', () => {
    expect(calcularMRR(
      [contrato({ data_fim: '2026-04-30' })],
      '2026-05-01',
    )).toBe(0)
  })

  it('excludes churned and paused contracts', () => {
    expect(calcularMRR(
      [contrato({ status: 'churned' }), contrato({ status: 'pausado' })],
      '2026-05-01',
    )).toBe(0)
  })
})

describe('calcularARR', () => {
  it('is MRR * 12', () => {
    const c = [contrato({ tipo: 'mensal', ticket: 1000 })]
    expect(calcularARR(c, '2026-05-01')).toBe(12000)
  })
})

describe('calcularChurnRate', () => {
  it('returns 0 when nothing churned', () => {
    expect(calcularChurnRate([], '2026-05-01')).toBe(0)
  })

  it('returns ratio of churned MRR / total MRR start of month', () => {
    const c = [
      contrato({ id: '1', ticket: 1000, status: 'ativo' }),
      contrato({ id: '2', ticket: 500, status: 'churned', data_churn: '2026-05-15', data_fim: '2026-05-15' }),
    ]
    // MRR start of month = 1000 + 500 = 1500
    // churned MRR in month = 500
    // churn rate = 500/1500 = 0.333...
    expect(calcularChurnRate(c, '2026-05-01')).toBeCloseTo(500 / 1500, 5)
  })
})

describe('calcularNRR', () => {
  it('returns 1.0 when no changes (kept all contracts at same ticket)', () => {
    const start = [contrato({ id: '1', ticket: 1000 })]
    const end = [contrato({ id: '1', ticket: 1000 })]
    expect(calcularNRR(start, end)).toBe(1.0)
  })

  it('returns > 1 when existing customers expanded', () => {
    const start = [contrato({ id: '1', cliente_id: 'A', ticket: 1000 })]
    const end = [contrato({ id: '2', cliente_id: 'A', ticket: 1500 })]
    expect(calcularNRR(start, end)).toBe(1.5)
  })

  it('does not include new customers in NRR', () => {
    const start = [contrato({ id: '1', cliente_id: 'A', ticket: 1000 })]
    const end = [
      contrato({ id: '1', cliente_id: 'A', ticket: 1000 }),
      contrato({ id: '2', cliente_id: 'B', ticket: 5000 }),  // new logo
    ]
    expect(calcularNRR(start, end)).toBe(1.0)
  })
})
