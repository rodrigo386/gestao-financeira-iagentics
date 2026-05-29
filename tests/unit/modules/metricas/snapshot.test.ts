import { describe, it, expect } from 'vitest'
import { montarMetricas } from '@/modules/metricas/snapshot'
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

describe('montarMetricas', () => {
  it('soma entradas e saídas do mês e calcula resultado', () => {
    const m = montarMetricas({
      mesRef: '2026-04-01',
      contratos: [contrato({ tipo: 'mensal', ticket: 5000 })],
      lancamentos: [
        { tipo: 'entrada', valor: 8000 },
        { tipo: 'entrada', valor: 2000 },
        { tipo: 'saida', valor: 6000 },
      ],
      caixaFim: 50000,
    })
    expect(m.receita_total).toBe(10000)
    expect(m.despesa_total).toBe(6000)
    expect(m.resultado).toBe(4000)
    expect(m.caixa_fim).toBe(50000)
    expect(m.mrr).toBe(5000)
    expect(m.arr).toBe(60000)
    expect(m.contratos_ativos).toBe(1)
  })

  it('runway = caixa_fim / despesa_total arredondado a 1 casa', () => {
    const m = montarMetricas({
      mesRef: '2026-04-01', contratos: [],
      lancamentos: [{ tipo: 'saida', valor: 10000 }], caixaFim: 35000,
    })
    expect(m.runway_meses).toBe(3.5)
  })

  it('runway null quando despesa_total = 0', () => {
    const m = montarMetricas({ mesRef: '2026-04-01', contratos: [], lancamentos: [], caixaFim: 1000 })
    expect(m.runway_meses).toBeNull()
  })

  it('runway null quando quociente > 36', () => {
    const m = montarMetricas({
      mesRef: '2026-04-01', contratos: [],
      lancamentos: [{ tipo: 'saida', valor: 100 }], caixaFim: 100000,
    })
    expect(m.runway_meses).toBeNull()
  })
})
