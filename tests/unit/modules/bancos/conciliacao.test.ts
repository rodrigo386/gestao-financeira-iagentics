import { describe, it, expect } from 'vitest'
import { classificarBreak, scoreMatch } from '@/modules/bancos/conciliacao'

const lanc = (p: Partial<{ id: string; valor: number; data: string; descricao: string; tipo: 'entrada' | 'saida' }>) => ({
  id: p.id ?? 'l1',
  valor: p.valor ?? 100,
  data: p.data ?? '2026-05-10',
  descricao: p.descricao ?? 'Pix recebido',
  tipo: p.tipo ?? ('entrada' as const),
})

const cand = (p: Partial<{ id: string; valor: number; data_vencimento: string; descricao: string; tipo: 'ap' | 'ar' }>) => ({
  id: p.id ?? 'c1',
  valor: p.valor ?? 100,
  data_vencimento: p.data_vencimento ?? '2026-05-10',
  descricao: p.descricao ?? 'AR cliente X',
  tipo: p.tipo ?? ('ar' as const),
})

describe('scoreMatch', () => {
  it('exact value + same date → 0.8+', () => {
    const s = scoreMatch(lanc({ valor: 100, data: '2026-05-10' }), cand({ valor: 100, data_vencimento: '2026-05-10', descricao: 'Pix' }))
    expect(s).toBeGreaterThanOrEqual(0.8)
  })

  it('exact value, 1 day off → still high', () => {
    const s = scoreMatch(lanc({ valor: 100, data: '2026-05-10' }), cand({ valor: 100, data_vencimento: '2026-05-09' }))
    expect(s).toBeGreaterThan(0.6)
    expect(s).toBeLessThan(0.95)
  })

  it('value differs by 1% → low', () => {
    const s = scoreMatch(lanc({ valor: 100 }), cand({ valor: 99 }))
    expect(s).toBeLessThan(0.5)
  })
})

describe('classificarBreak', () => {
  it('no candidates → bank-only', () => {
    const r = classificarBreak(lanc({}), [])
    expect(r.classificacao).toBe('bank-only')
  })

  it('exact value + date match → matched', () => {
    const c = cand({ valor: 100, data_vencimento: '2026-05-10' })
    const r = classificarBreak(lanc({ valor: 100, data: '2026-05-10' }), [c])
    expect(r.classificacao).toBe('matched')
    expect(r.melhor_match_id).toBe(c.id)
    expect(r.score).toBeGreaterThanOrEqual(0.8)
  })

  it('exact value, date >3d off → timing-break', () => {
    const c = cand({ valor: 100, data_vencimento: '2026-05-01' })
    const r = classificarBreak(lanc({ valor: 100, data: '2026-05-10' }), [c])
    expect(r.classificacao).toBe('timing-break')
  })

  it('same date, valor differs → amount-break', () => {
    const c = cand({ valor: 105, data_vencimento: '2026-05-10' })
    const r = classificarBreak(lanc({ valor: 100, data: '2026-05-10' }), [c])
    expect(r.classificacao).toBe('amount-break')
  })

  it('multiple candidates with same exact match → matched on first', () => {
    const c1 = cand({ id: 'c1', valor: 100, data_vencimento: '2026-05-10' })
    const c2 = cand({ id: 'c2', valor: 100, data_vencimento: '2026-05-10' })
    const r = classificarBreak(lanc({ valor: 100, data: '2026-05-10' }), [c1, c2])
    expect(r.classificacao).toBe('matched')
    expect(['c1', 'c2']).toContain(r.melhor_match_id)
  })
})
