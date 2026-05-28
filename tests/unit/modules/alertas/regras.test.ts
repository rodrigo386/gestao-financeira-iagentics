import { describe, it, expect } from 'vitest'
import {
  avaliarRunway,
  avaliarAPAtrasada,
  avaliarARAtrasada,
  avaliarContratoVencendo,
  avaliarDespesaAnomala,
  avaliarCaixaBaixo,
} from '@/modules/alertas/regras'

const hoje = '2026-05-15'

describe('avaliarRunway', () => {
  it('returns null when runway > 12', () => {
    expect(avaliarRunway(15)).toBeNull()
    expect(avaliarRunway(null)).toBeNull()  // null = > horizon
  })
  it('emits warning when 6 < runway <= 12', () => {
    const a = avaliarRunway(8)!
    expect(a.tipo).toBe('runway_atencao')
    expect(a.severidade).toBe('warning')
  })
  it('emits critical when runway <= 6', () => {
    const a = avaliarRunway(4)!
    expect(a.tipo).toBe('runway_critico')
    expect(a.severidade).toBe('critical')
  })
})

describe('avaliarAPAtrasada', () => {
  it('returns null when no overdue', () => {
    expect(avaliarAPAtrasada([])).toBeNull()
  })
  it('emits warning when overdue exist', () => {
    const a = avaliarAPAtrasada([
      { id: 'ap1', descricao: 'AWS', valor: 500, data_vencimento: '2026-05-10' },
    ])!
    expect(a.severidade).toBe('warning')
    expect(a.tipo).toBe('ap_atrasada')
  })
})

describe('avaliarARAtrasada', () => {
  it('returns null when no overdue', () => {
    expect(avaliarARAtrasada([])).toBeNull()
  })
  it('emits warning when overdue exist', () => {
    const a = avaliarARAtrasada([
      { id: 'ar1', cliente_nome: 'Cliente X', valor: 1000, data_vencimento: '2026-05-10' },
    ])!
    expect(a.severidade).toBe('warning')
  })
})

describe('avaliarContratoVencendo', () => {
  it('returns null when none vencendo in 30-60d window', () => {
    expect(avaliarContratoVencendo([])).toBeNull()
  })
  it('emits info', () => {
    const a = avaliarContratoVencendo([
      { id: 'co1', cliente_nome: 'X', nome: 'Pro', data_fim: '2026-06-15' },
    ])!
    expect(a.severidade).toBe('info')
  })
})

describe('avaliarDespesaAnomala', () => {
  it('returns null when value <= 2x media', () => {
    expect(avaliarDespesaAnomala([
      { id: 'l1', valor: 100, descricao: 'X', categoria_nome: 'Tech', media_90d: 80 },
    ])).toBeNull()
  })
  it('emits warning when value > 2x media', () => {
    const a = avaliarDespesaAnomala([
      { id: 'l1', valor: 500, descricao: 'X', categoria_nome: 'Tech', media_90d: 100 },
    ])!
    expect(a.severidade).toBe('warning')
  })
})

describe('avaliarCaixaBaixo', () => {
  it('returns null when caixa above threshold', () => {
    expect(avaliarCaixaBaixo(50000, 30000)).toBeNull()
  })
  it('emits critical when below', () => {
    const a = avaliarCaixaBaixo(20000, 30000)!
    expect(a.severidade).toBe('critical')
    expect(a.tipo).toBe('caixa_baixo')
  })
})
