import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { AP_SELECT } from '@/modules/contas-pagar/ap'

// Regression: contas_a_pagar has a polymorphic creditor (tipo_credor + credor_id, no FK),
// so AP_SELECT must NOT embed fornecedores — PostgREST can only embed across real FKs.
// Embedding a non-existent relationship throws "Could not find a relationship ...".
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function admin() {
  return createClient('http://127.0.0.1:54321', SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('listarAP projection (AP_SELECT)', () => {
  it('AP_SELECT is a valid PostgREST projection (only embeds real FKs)', async () => {
    const { error } = await admin().from('contas_a_pagar').select(AP_SELECT).limit(1)
    expect(error).toBeNull()
  })

  it('AP_SELECT does not embed fornecedores (no FK on polymorphic credor)', () => {
    expect(AP_SELECT).not.toContain('fornecedores')
  })
})
