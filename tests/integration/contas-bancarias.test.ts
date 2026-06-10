import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { criarContaBancaria, listarContasBancarias, atualizarContaBancaria } from '@/modules/bancos/contas'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function db() { return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }

// Cria um usuário real (linha usuarios p/ FK do audit_log). role 'financeiro' evita o singleton de admin.
async function seedUserId(): Promise<string> {
  const d = db()
  const { data } = await d.auth.admin.createUser({
    email: `cb-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`,
    password: 'seed-pass-123', email_confirm: true,
  })
  const id = data.user!.id
  await d.from('usuarios').upsert({ id, nome: 'CB Admin', role: 'financeiro' }, { onConflict: 'id' })
  return id
}

describe('contas bancárias (módulo)', () => {
  it('admin cria, lista e edita saldo; audita', async () => {
    const userId = await seedUserId()
    const actor = { id: userId, role: 'admin' }

    const criada = await criarContaBancaria(
      { banco: `NuBank-${Date.now()}`, agencia: '0001', conta: '12345-6', tipo: 'cc', saldo_atual: 5000, ativa: true },
      actor,
    )
    expect(criada.id).toBeTruthy()
    expect(Number(criada.saldo_atual)).toBe(5000)

    const lista = await listarContasBancarias()
    expect(lista.some((c) => c.id === criada.id)).toBe(true)

    const upd = await atualizarContaBancaria(criada.id, { saldo_atual: 7500, ativa: false }, actor)
    expect(Number(upd.saldo_atual)).toBe(7500)
    expect(upd.ativa).toBe(false)

    const { count } = await db().from('audit_log')
      .select('id', { count: 'exact', head: true }).eq('tabela', 'contas_bancarias').eq('registro_id', criada.id)
    expect((count ?? 0)).toBeGreaterThanOrEqual(1)
  })

  it('bloqueia chamador não-admin', async () => {
    const userId = await seedUserId()
    await expect(
      criarContaBancaria({ banco: 'X', tipo: 'cc', saldo_atual: 0, ativa: true }, { id: userId, role: 'financeiro' }),
    ).rejects.toThrow(/admin/i)
  })
})
