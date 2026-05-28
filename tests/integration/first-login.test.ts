import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? (() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY not set — copy it from `supabase status` into your shell env') })()

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('first login bootstraps admin', () => {
  it('creates an auth user and a usuarios row with role=admin when no admin exists', async () => {
    const db = admin()

    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: `test-${Date.now()}@iagentics.test`,
      email_confirm: true,
    })
    expect(createErr).toBeNull()
    const userId = created.user!.id

    const { count: adminCountBefore } = await db
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
    const shouldBeAdmin = (adminCountBefore ?? 0) === 0

    await db.from('usuarios').upsert(
      { id: userId, nome: 'Test', role: shouldBeAdmin ? 'admin' : 'leitura' },
      { onConflict: 'id', ignoreDuplicates: true },
    )

    const { data: row } = await db.from('usuarios').select('role').eq('id', userId).single()
    expect(row?.role).toBe('admin')

    // Second user should be 'leitura'
    const { data: created2 } = await db.auth.admin.createUser({
      email: `test2-${Date.now()}@iagentics.test`,
      email_confirm: true,
    })
    const userId2 = created2.user!.id
    const { count: adminCountNow } = await db
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
    const shouldBeAdmin2 = (adminCountNow ?? 0) === 0
    await db.from('usuarios').upsert(
      { id: userId2, nome: 'Test2', role: shouldBeAdmin2 ? 'admin' : 'leitura' },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    const { data: row2 } = await db.from('usuarios').select('role').eq('id', userId2).single()
    expect(row2?.role).toBe('leitura')
  })
})
