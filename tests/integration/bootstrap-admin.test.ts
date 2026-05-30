import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { bootstrapAdmin } from '../../scripts/bootstrap-admin-core.mjs'

const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe('bootstrapAdmin', () => {
  it('é idempotente e resulta em exatamente um admin', async () => {
    const email = `boot-${Date.now()}@iagentics.test`

    const r1 = await bootstrapAdmin({ url: URL, serviceKey: KEY, email, password: 'senha-inicial-1', nome: 'Boot' })
    expect(r1.status).toBe('created')

    const r2 = await bootstrapAdmin({ url: URL, serviceKey: KEY, email, password: 'senha-nova-2', nome: 'Boot' })
    expect(r2.status).toBe('password-updated')
    expect(r2.userId).toBe(r1.userId)

    const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { count } = await db.from('usuarios').select('id', { count: 'exact', head: true }).eq('role', 'admin')
    expect(count).toBe(1)
  })
})
