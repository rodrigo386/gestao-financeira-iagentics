import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Pluggy client (mock mode)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.PLUGGY_MODE = 'mock'
  })

  it('listTransactions returns mock transactions for an item', async () => {
    const { listTransactions } = await import('@/modules/bancos/pluggy-client')
    const txs = await listTransactions({ pluggyItemId: 'mock-item-1', from: '2026-05-01', to: '2026-05-31' })
    expect(Array.isArray(txs)).toBe(true)
    expect(txs.length).toBeGreaterThan(0)
    expect(txs[0]).toMatchObject({
      id: expect.any(String),
      date: expect.any(String),
      amount: expect.any(Number),
      description: expect.any(String),
    })
  })

  it('getItem returns mock item status', async () => {
    const { getItem } = await import('@/modules/bancos/pluggy-client')
    const item = await getItem('mock-item-1')
    expect(item.id).toBe('mock-item-1')
    expect(['updated', 'updating', 'error']).toContain(item.status)
  })
})
