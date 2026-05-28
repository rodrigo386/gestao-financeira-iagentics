import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { gerarAPDeRecorrente } from '@/modules/contas-pagar/gerador'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('AP fluxo completo (recorrente → AP → pago → lancamento)', () => {
  let db: ReturnType<typeof admin>
  let fornecedorId: string
  let categoriaId: string
  let contaId: string
  let usuarioId: string

  beforeEach(async () => {
    db = admin()

    // Test user (needed for aprovador_id FK constraint)
    const { data: authUser } = await db.auth.admin.createUser({
      email: `int-${Date.now()}@iagentics.test`,
      email_confirm: true,
    })
    usuarioId = authUser!.user!.id
    await db.from('usuarios').insert({ id: usuarioId, nome: 'IntTest', role: 'admin' })

    const { data: f } = await db
      .from('fornecedores')
      .insert({ nome: `AWS-${Date.now()}` })
      .select()
      .single()
    fornecedorId = f!.id

    const { data: c } = await db
      .from('categorias')
      .select('id')
      .eq('nome', 'Cloud')
      .single()
    categoriaId = c!.id

    const { data: cb } = await db
      .from('contas_bancarias')
      .insert({ banco: `Test-${Date.now()}`, tipo: 'cc', saldo_atual: 100000 })
      .select()
      .single()
    contaId = cb!.id
  })

  it('full happy path: recorrente → AP previsto → aprovado → pago + lancamento linked', async () => {
    // Create a recurring expense
    const { data: rec } = await db
      .from('despesas_recorrentes')
      .insert({
        fornecedor_id: fornecedorId,
        descricao: 'AWS mensal',
        valor: 500,
        dia_mes: 10,
        categoria_id: categoriaId,
        data_inicio: '2026-05-01',
        proxima_geracao: '2026-05-01',
      })
      .select()
      .single()
    expect(rec).toBeTruthy()

    // Generate AP from recorrente
    const apInput = gerarAPDeRecorrente(rec as never, '2026-05-01')!
    expect(apInput).not.toBeNull()

    const { data: ap } = await db
      .from('contas_a_pagar')
      .insert(apInput)
      .select()
      .single()
    expect(ap?.status).toBe('previsto')

    // Approve (with valid aprovador_id to satisfy ap_aprovado_requer_aprovador constraint)
    const { data: aprovado, error: aprErr } = await db
      .from('contas_a_pagar')
      .update({
        status: 'aprovado',
        aprovador_id: usuarioId,
        aprovado_em: new Date().toISOString(),
      })
      .eq('id', ap!.id)
      .select()
      .single()
    expect(aprErr).toBeNull()
    expect(aprovado?.status).toBe('aprovado')

    // Create lancamento linked to AP
    const { data: lancamento } = await db
      .from('lancamentos')
      .insert({
        data: '2026-05-10',
        valor: 500,
        conta_id: contaId,
        tipo: 'saida',
        categoria_id: categoriaId,
        descricao: 'AWS mensal',
        origem: 'ap',
        origem_id: ap!.id,
        fornecedor_id: fornecedorId,
      })
      .select()
      .single()
    expect(lancamento).toBeTruthy()

    // Mark AP as paid with lancamento_id
    const { data: pago, error: pagoErr } = await db
      .from('contas_a_pagar')
      .update({
        status: 'pago',
        data_pagamento: '2026-05-10',
        lancamento_id: lancamento!.id,
      })
      .eq('id', ap!.id)
      .select()
      .single()
    expect(pagoErr).toBeNull()
    expect(pago?.status).toBe('pago')
    expect(pago?.lancamento_id).toBe(lancamento!.id)
  })

  it('rejects marking AP pago without lancamento_id (check constraint)', async () => {
    const { data: rec } = await db
      .from('despesas_recorrentes')
      .insert({
        fornecedor_id: fornecedorId,
        descricao: 'X',
        valor: 100,
        dia_mes: 5,
        data_inicio: '2026-01-01',
        proxima_geracao: '2026-05-01',
      })
      .select()
      .single()
    const apInput = gerarAPDeRecorrente(rec as never, '2026-05-01')!
    const { data: ap } = await db
      .from('contas_a_pagar')
      .insert(apInput)
      .select()
      .single()

    // Try to set pago without lancamento_id — should violate ap_pago_requer_lancamento
    const { error } = await db
      .from('contas_a_pagar')
      .update({ status: 'pago', data_pagamento: '2026-05-10' })
      .eq('id', ap!.id)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/ap_pago_requer_lancamento|violates check constraint/i)
  })

  it('rejects duplicate AP for same recorrente in same month', async () => {
    const { data: rec } = await db
      .from('despesas_recorrentes')
      .insert({
        fornecedor_id: fornecedorId,
        descricao: 'Y',
        valor: 200,
        dia_mes: 15,
        data_inicio: '2026-01-01',
        proxima_geracao: '2026-05-01',
      })
      .select()
      .single()
    const apInput = gerarAPDeRecorrente(rec as never, '2026-05-01')!
    await db.from('contas_a_pagar').insert(apInput)

    // Second insert with same recorrente + month should fail with unique violation
    const { error } = await db.from('contas_a_pagar').insert(apInput)
    expect(error?.code).toBe('23505')
  })
})
