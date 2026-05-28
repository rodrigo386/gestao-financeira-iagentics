import { describe, it, expect } from 'vitest'
import { buildLancamentoFromAR, buildLancamentoFromAP } from '@/modules/despesas/lancamentos'

describe('buildLancamentoFromAR', () => {
  it('produces an entrada lancamento', () => {
    const ar = {
      id: 'ar-1', cliente_id: 'c-1', valor: 1000, moeda: 'BRL', data_emissao: '2026-05-01',
      data_vencimento: '2026-05-10', origem: 'contrato' as const, origem_id: 'co-1',
    }
    const l = buildLancamentoFromAR(ar as never, '2026-05-12', 'conta-1', 'cat-1')
    expect(l.tipo).toBe('entrada')
    expect(l.valor).toBe(1000)
    expect(l.data).toBe('2026-05-12')
    expect(l.conta_id).toBe('conta-1')
    expect(l.categoria_id).toBe('cat-1')
    expect(l.origem).toBe('ar')
    expect(l.origem_id).toBe('ar-1')
    expect(l.cliente_id).toBe('c-1')
    expect(l.descricao).toContain('Recebimento')
  })
})

describe('buildLancamentoFromAP', () => {
  it('produces a saida lancamento', () => {
    const ap = {
      id: 'ap-1', tipo_credor: 'fornecedor' as const, credor_id: 'f-1',
      valor: 500, moeda: 'BRL', descricao: 'AWS', categoria_id: 'cat-tech',
    }
    const l = buildLancamentoFromAP(ap as never, '2026-05-10', 'conta-1')
    expect(l.tipo).toBe('saida')
    expect(l.valor).toBe(500)
    expect(l.data).toBe('2026-05-10')
    expect(l.conta_id).toBe('conta-1')
    expect(l.categoria_id).toBe('cat-tech')
    expect(l.origem).toBe('ap')
    expect(l.origem_id).toBe('ap-1')
    expect(l.fornecedor_id).toBe('f-1')
    expect(l.descricao).toBe('AWS')
  })
})
