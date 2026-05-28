import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { gerarARDoContrato } from '@/modules/contas-receber/gerador'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('contract generates AR pipeline', () => {
  let db: ReturnType<typeof admin>
  let clienteId: string

  beforeEach(async () => {
    db = admin()
    // Create a fresh cliente per test
    const { data: c } = await db.from('clientes')
      .insert({ nome: `Acme-${Date.now()}`, status: 'ativo' })
      .select()
      .single()
    clienteId = c!.id
  })

  it('creates AR from active contract for the current month', async () => {
    // 1. Create contract
    const { data: contrato } = await db.from('contratos').insert({
      cliente_id: clienteId,
      nome: 'AaaS Pro',
      tipo: 'mensal',
      ticket: 1000,
      dia_cobranca: 10,
      data_inicio: '2026-05-01',
      status: 'ativo',
    }).select().single()
    expect(contrato).toBeTruthy()

    // 2. Use generator
    const newAR = gerarARDoContrato(contrato as never, '2026-05-01')
    expect(newAR).not.toBeNull()
    expect(newAR!.valor).toBe(1000)

    // 3. Insert
    const { data: ar, error: arErr } = await db.from('contas_a_receber').insert(newAR!).select().single()
    expect(arErr).toBeNull()
    expect(ar?.status).toBe('previsto')

    // 4. Mark as received
    const { data: updated, error: updErr } = await db
      .from('contas_a_receber')
      .update({ status: 'recebido', data_recebimento: '2026-05-12' })
      .eq('id', ar!.id)
      .select()
      .single()
    expect(updErr).toBeNull()
    expect(updated?.status).toBe('recebido')
    expect(updated?.data_recebimento).toBe('2026-05-12')
  })

  it('dedup: second insert with same contract+month fails on unique index', async () => {
    const { data: contrato } = await db.from('contratos').insert({
      cliente_id: clienteId,
      nome: 'X',
      ticket: 500,
      dia_cobranca: 1,
      data_inicio: '2026-01-01',
      status: 'ativo',
    }).select().single()

    const ar = gerarARDoContrato(contrato as never, '2026-05-01')!
    await db.from('contas_a_receber').insert(ar)

    // Try to insert duplicate
    const { error } = await db.from('contas_a_receber').insert(ar)
    expect(error?.code).toBe('23505')
  })
})
