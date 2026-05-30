import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { criarUsuario, listarUsuarios } from '@/modules/usuarios/usuarios'

// O módulo usa createServiceClient, que lê estas envs. Forçar LOCAL.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'

const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

function db() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Cria um usuário auth + linha usuarios com a role pedida; devolve um Actor válido.
async function makeUser(role: 'admin' | 'financeiro' | 'leitura') {
  const d = db()
  const email = `${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`
  const { data, error } = await d.auth.admin.createUser({ email, password: 'seed-pass-123', email_confirm: true })
  if (error || !data.user) throw new Error(error?.message)
  const id = data.user.id
  await d.from('usuarios').upsert({ id, nome: role, role }, { onConflict: 'id', ignoreDuplicates: false })
  return { id, role, email }
}

describe('criarUsuario', () => {
  it('bloqueia chamador não-admin', async () => {
    const leitura = await makeUser('leitura')
    await expect(
      criarUsuario({ email: `x-${Date.now()}@iagentics.test`, senha: 'senha-1234', nome: 'X', role: 'leitura' }, { id: leitura.id, role: 'leitura' }),
    ).rejects.toThrow(/admin/i)
  })

  it('admin cria usuário com auth + linha usuarios e login por senha funciona', async () => {
    const admin = await makeUser('admin')
    const email = `novo-${Date.now()}@iagentics.test`
    const { id } = await criarUsuario({ email, senha: 'senha-1234', nome: 'Novo', role: 'financeiro' }, { id: admin.id, role: 'admin' })

    const { data: row } = await db().from('usuarios').select('nome, role').eq('id', id).single()
    expect(row?.role).toBe('financeiro')
    expect(row?.nome).toBe('Novo')

    const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: signIn, error } = await anon.auth.signInWithPassword({ email, password: 'senha-1234' })
    expect(error).toBeNull()
    expect(signIn.session).not.toBeNull()
  })

  it('rejeita role=admin na criação', async () => {
    const admin = await makeUser('admin')
    await expect(
      // @ts-expect-error role inválida de propósito
      criarUsuario({ email: `a-${Date.now()}@iagentics.test`, senha: 'senha-1234', nome: 'A', role: 'admin' }, { id: admin.id, role: 'admin' }),
    ).rejects.toThrow()
  })
})

describe('listarUsuarios', () => {
  it('admin vê usuários com e-mail; não-admin é bloqueado', async () => {
    const admin = await makeUser('admin')
    const lista = await listarUsuarios({ id: admin.id, role: 'admin' })
    expect(lista.some((u) => u.email && u.role)).toBe(true)
    await expect(listarUsuarios({ id: admin.id, role: 'leitura' })).rejects.toThrow(/admin/i)
  })
})
