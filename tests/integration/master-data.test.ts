import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { listarEntidade, excluirEntidade } from '@/modules/master-data/master-data'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function db() { return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }

async function seedUserId(): Promise<string> {
  const d = db()
  const { data } = await d.auth.admin.createUser({
    email: `md-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`,
    password: 'seed-pass-123', email_confirm: true,
  })
  const id = data.user!.id
  await d.from('usuarios').upsert({ id, nome: 'MD', role: 'financeiro' }, { onConflict: 'id' })
  return id
}

describe('master-data', () => {
  it('lista e exclui um cadastro sem vínculos', async () => {
    const userId = await seedUserId()
    const actor = { id: userId, role: 'admin' }
    const { data: c } = await db().from('clientes').insert({ nome: `MDCli-${Date.now()}`, status: 'ativo' }).select().single()

    const lista = await listarEntidade('clientes')
    expect(lista.some((r) => r.id === c!.id)).toBe(true)

    await excluirEntidade('clientes', c!.id, actor)
    const { data: depois } = await db().from('clientes').select('id').eq('id', c!.id).maybeSingle()
    expect(depois).toBeNull()
  })

  it('bloqueia exclusão quando há vínculo (FK) com mensagem amigável', async () => {
    const userId = await seedUserId()
    const actor = { id: userId, role: 'admin' }
    const { data: c } = await db().from('clientes').insert({ nome: `MDCli2-${Date.now()}`, status: 'ativo' }).select().single()
    // projetos.cliente_id é ON DELETE RESTRICT (migration 0008) → exclusão do cliente bloqueia
    await db().from('projetos').insert({
      cliente_id: c!.id, nome: 'Proj X', valor_total: 1000,
      data_inicio: '2026-01-01', data_prevista_fim: '2026-06-01', status: 'ativo',
    })
    await expect(excluirEntidade('clientes', c!.id, actor)).rejects.toThrow(/vinculados/i)
  })

  it('bloqueia chamador não-admin', async () => {
    const userId = await seedUserId()
    const { data: c } = await db().from('clientes').insert({ nome: `MDCli3-${Date.now()}`, status: 'ativo' }).select().single()
    await expect(excluirEntidade('clientes', c!.id, { id: userId, role: 'financeiro' })).rejects.toThrow(/admin/i)
  })
})
