import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { conciliarPendentes } from '@/modules/bancos/conciliar'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// conciliarPendentes → createServiceClient reads NEXT_PUBLIC_SUPABASE_URL from env
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('conciliacao auto', () => {
  let db: ReturnType<typeof admin>

  beforeEach(() => { db = admin() })

  it('auto-links AR when score >= 0.8', async () => {
    // setup: cliente, conta_bancaria, AR, lancamento
    const { data: cliente } = await db.from('clientes')
      .insert({ nome: `Cliente-${Date.now()}` }).select().single()
    const { data: conta } = await db.from('contas_bancarias')
      .insert({ banco: `BancoTest-${Date.now()}`, tipo: 'cc' }).select().single()

    const { data: ar } = await db.from('contas_a_receber').insert({
      cliente_id: cliente!.id,
      origem: 'avulso',
      valor: 1000,
      data_emissao: '2026-05-01',
      data_vencimento: '2026-05-10',
      status: 'previsto',
      observacoes: 'Recebimento via pix',
    }).select().single()

    const { data: lanc } = await db.from('lancamentos').insert({
      data: '2026-05-10',
      valor: 1000,
      conta_id: conta!.id,
      tipo: 'entrada',
      descricao: 'Pix recebido',
      origem: 'pluggy',
      pluggy_transaction_id: `tx-${Date.now()}`,
      conciliado: false,
    }).select().single()

    // Run conciliation
    const result = await conciliarPendentes()
    expect(result.processados).toBeGreaterThan(0)
    expect(result.matched).toBeGreaterThan(0)

    // Verify AR linked
    const { data: arAfter } = await db.from('contas_a_receber').select('*').eq('id', ar!.id).single()
    expect(arAfter?.status).toBe('recebido')
    expect(arAfter?.lancamento_id).toBe(lanc!.id)

    // Verify lancamento conciliado
    const { data: lancAfter } = await db.from('lancamentos').select('conciliado').eq('id', lanc!.id).single()
    expect(lancAfter?.conciliado).toBe(true)
  })
})
