import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Forçar LOCAL (o módulo/clients leem estas envs)
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'

const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

function admin(): SupabaseClient {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Cria um usuário auth (senha conhecida) + linha usuarios com a role pedida.
async function makeUser(role: 'financeiro' | 'leitura') {
  const d = admin()
  const email = `rls-${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`
  const password = 'guard-pass-123'
  const { data, error } = await d.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(error?.message)
  const id = data.user.id
  await d.from('usuarios').upsert({ id, nome: role, role }, { onConflict: 'id', ignoreDuplicates: false })
  return { id, email, password }
}

// Cliente autenticado como o próprio usuário (role 'authenticated' + auth.uid()).
async function authedClient(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn: ${error.message}`)
  return c
}

describe('RLS guard: alteração de role (migration 0030)', () => {
  it('bloqueia um não-admin de auto-promover a própria role', async () => {
    const u = await makeUser('leitura')
    const c = await authedClient(u.email, u.password)

    const { error } = await c.from('usuarios').update({ role: 'financeiro' }).eq('id', u.id)
    expect(error).not.toBeNull()

    const { data: row } = await admin().from('usuarios').select('role').eq('id', u.id).single()
    expect(row?.role).toBe('leitura') // permaneceu inalterada
  })

  it('ainda permite o não-admin atualizar o próprio nome', async () => {
    const u = await makeUser('leitura')
    const c = await authedClient(u.email, u.password)

    const { error } = await c.from('usuarios').update({ nome: 'Nome Novo' }).eq('id', u.id)
    expect(error).toBeNull()

    const { data: row } = await admin().from('usuarios').select('nome, role').eq('id', u.id).single()
    expect(row?.nome).toBe('Nome Novo')
    expect(row?.role).toBe('leitura')
  })

  it('ainda permite o caminho admin (service role) trocar a role', async () => {
    const u = await makeUser('leitura')

    const { error } = await admin().from('usuarios').update({ role: 'financeiro' }).eq('id', u.id)
    expect(error).toBeNull()

    const { data: row } = await admin().from('usuarios').select('role').eq('id', u.id).single()
    expect(row?.role).toBe('financeiro')
  })
})
