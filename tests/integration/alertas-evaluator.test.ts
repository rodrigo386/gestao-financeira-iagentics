import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { avaliarTodos } from '@/modules/alertas/evaluator'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.RESEND_MODE = 'mock'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient('http://127.0.0.1:54321', SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('alertas evaluator', () => {
  it('avaliarTodos inserts alertas for known conditions (overdue AP)', async () => {
    const db = admin()

    // Create overdue AP
    const { data: fornecedor } = await db.from('fornecedores')
      .insert({ nome: `For-${Date.now()}` }).select().single()
    await db.from('contas_a_pagar').insert({
      tipo_credor: 'fornecedor',
      credor_id: fornecedor!.id,
      origem: 'avulso',
      descricao: 'Old bill',
      valor: 500,
      data_vencimento: '2026-01-01', // way overdue
      status: 'previsto',
    })

    // Clear existing alertas to avoid dedup
    await db.from('alertas').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    const stats = await avaliarTodos('2026-05-15')
    expect(stats.notified).toBeGreaterThan(0)

    const { data: alertas } = await db.from('alertas')
      .select('tipo').eq('tipo', 'ap_atrasada')
    expect(alertas?.length ?? 0).toBeGreaterThan(0)
  })
})
