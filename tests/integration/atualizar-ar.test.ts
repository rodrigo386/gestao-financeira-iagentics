import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { atualizarAR } from '@/modules/contas-receber/ar'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function db() { return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }

async function seedUserId(): Promise<string> {
  const d = db()
  const { data } = await d.auth.admin.createUser({
    email: `ar-edit-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`,
    password: 'seed-pass-123', email_confirm: true,
  })
  const id = data.user!.id
  // audit_log.usuario_id referencia usuarios(id) → precisa de uma linha usuarios.
  // role 'financeiro' evita o índice singleton de admin.
  await d.from('usuarios').upsert({ id, nome: 'AR Editor', role: 'financeiro' }, { onConflict: 'id' })
  return id
}

async function seedAR(): Promise<{ arId: string; clienteId: string }> {
  const d = db()
  const { data: c } = await d.from('clientes')
    .insert({ nome: `Acme-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, status: 'ativo' }).select().single()
  const { data: ar } = await d.from('contas_a_receber').insert({
    cliente_id: c!.id, origem: 'avulso', valor: 1000, moeda: 'BRL',
    data_emissao: '2026-05-01', data_vencimento: '2026-05-10', status: 'previsto',
  }).select().single()
  return { arId: ar!.id, clienteId: c!.id }
}

describe('atualizarAR', () => {
  it('edita datas, valor e status; grava audit', async () => {
    const userId = await seedUserId()
    const { arId } = await seedAR()
    const upd = await atualizarAR(arId, { data_vencimento: '2026-05-20', valor: 1500, status: 'emitido' }, userId)
    expect(Number(upd.valor)).toBe(1500)
    expect(upd.data_vencimento).toBe('2026-05-20')
    expect(upd.status).toBe('emitido')

    const { count } = await db().from('audit_log')
      .select('id', { count: 'exact', head: true }).eq('registro_id', arId).eq('tabela', 'contas_a_receber')
    expect((count ?? 0)).toBeGreaterThanOrEqual(1)
  })

  it('rejeita vencimento < emissão', async () => {
    const userId = await seedUserId()
    const { arId } = await seedAR()
    await expect(atualizarAR(arId, { data_vencimento: '2026-04-01' }, userId)).rejects.toThrow(/vencimento/i)
  })

  it('rejeita valor <= 0', async () => {
    const userId = await seedUserId()
    const { arId } = await seedAR()
    await expect(atualizarAR(arId, { valor: 0 }, userId)).rejects.toThrow()
  })

  it('rejeita editar AR recebida', async () => {
    const userId = await seedUserId()
    const d = db()
    // Seed a conta bancária para o lancamento
    const { data: conta } = await d.from('contas_bancarias')
      .insert({ banco: `Bank-${Date.now()}`, tipo: 'cc', saldo_atual: 0 }).select().single()
    // Seed cliente
    const { data: cli } = await d.from('clientes')
      .insert({ nome: `CliRec-${Date.now()}`, status: 'ativo' }).select().single()
    // Seed lancamento (necessário por constraint ar_recebido_requer_lancamento)
    const { data: lanc } = await d.from('lancamentos')
      .insert({ data: '2026-05-15', valor: 1000, conta_id: conta!.id, tipo: 'entrada', descricao: 'receb', origem: 'ar' })
      .select().single()
    // Inserir AR já recebida (com todos os campos necessários)
    const { data: ar } = await d.from('contas_a_receber').insert({
      cliente_id: cli!.id, origem: 'avulso', valor: 1000, moeda: 'BRL',
      data_emissao: '2026-05-01', data_vencimento: '2026-05-10',
      status: 'recebido', data_recebimento: '2026-05-15', lancamento_id: lanc!.id,
    }).select().single()
    await expect(atualizarAR(ar!.id, { valor: 2000 }, userId)).rejects.toThrow(/recebida/i)
  })

  it('bloqueia usuário sem permissão de escrita (leitura)', async () => {
    const d = db()
    const { data: u } = await d.auth.admin.createUser({
      email: `ar-leitura-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`,
      password: 'seed-pass-123', email_confirm: true,
    })
    await d.from('usuarios').upsert({ id: u.user!.id, nome: 'Leitor', role: 'leitura' }, { onConflict: 'id' })
    const { arId } = await seedAR()
    await expect(atualizarAR(arId, { valor: 1234 }, u.user!.id)).rejects.toThrow(/permiss/i)
  })
})
