import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { recomputarProjecoes } from '@/modules/forecast/cenarios'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient('http://127.0.0.1:54321', SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('forecast recompute', () => {
  it('writes 12 projections per cenario when recomputarProjecoes runs', async () => {
    const db = admin()

    // Seed contas so snapshot has a non-zero caixa
    await db.from('contas_bancarias').insert({ banco: `Test-${Date.now()}`, tipo: 'cc', saldo_atual: 50000 })

    const result = await recomputarProjecoes(undefined, 12)
    expect(result.recomputed).toBeGreaterThanOrEqual(3) // Base, Best, Worst

    const { data: projecoes } = await db.from('forecast_projecoes').select('cenario_id, mes_ref')
    const byCenario = new Map<string, number>()
    for (const p of projecoes ?? []) {
      byCenario.set(p.cenario_id, (byCenario.get(p.cenario_id) ?? 0) + 1)
    }
    for (const [, count] of byCenario) {
      expect(count).toBe(12)
    }
  })
})
