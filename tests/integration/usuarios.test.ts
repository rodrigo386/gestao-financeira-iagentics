import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { criarUsuario, listarUsuarios, redefinirSenha, trocarRole, removerUsuario } from '@/modules/usuarios/usuarios'

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
// Para role='admin': remove qualquer admin anterior (usuarios_admin_singleton impede múltiplos).
async function makeUser(role: 'admin' | 'financeiro' | 'leitura') {
  const d = db()
  if (role === 'admin') {
    const { data: existingAdmins } = await d.from('usuarios').select('id').eq('role', 'admin')
    for (const a of existingAdmins ?? []) {
      await d.from('usuarios').delete().eq('id', a.id)
      await d.auth.admin.deleteUser(a.id)
    }
  }
  const email = `${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`
  const { data, error } = await d.auth.admin.createUser({ email, password: 'seed-pass-123', email_confirm: true })
  if (error || !data.user) throw new Error(error?.message)
  const id = data.user.id
  const { error: upsertErr } = await d.from('usuarios').upsert({ id, nome: role, role }, { onConflict: 'id', ignoreDuplicates: false })
  if (upsertErr) throw new Error(`makeUser upsert failed: ${upsertErr.message}`)
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

describe('redefinirSenha', () => {
  it('admin redefine a senha e o usuário loga com a nova', async () => {
    const admin = await makeUser('admin')
    const email = `pw-${Date.now()}@iagentics.test`
    const { id } = await criarUsuario({ email, senha: 'senha-antiga-1', nome: 'PW', role: 'leitura' }, { id: admin.id, role: 'admin' })

    await redefinirSenha({ userId: id, novaSenha: 'senha-nova-9' }, { id: admin.id, role: 'admin' })

    const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await anon.auth.signInWithPassword({ email, password: 'senha-nova-9' })
    expect(error).toBeNull()
  })
})

describe('trocarRole', () => {
  it('troca entre financeiro/leitura e bloqueia mexer no admin', async () => {
    const admin = await makeUser('admin')
    const email = `role-${Date.now()}@iagentics.test`
    const { id } = await criarUsuario({ email, senha: 'senha-1234', nome: 'R', role: 'leitura' }, { id: admin.id, role: 'admin' })

    await trocarRole({ userId: id, role: 'financeiro' }, { id: admin.id, role: 'admin' })
    const { data: row } = await db().from('usuarios').select('role').eq('id', id).single()
    expect(row?.role).toBe('financeiro')

    // não pode alterar a role do admin
    await expect(trocarRole({ userId: admin.id, role: 'leitura' }, { id: admin.id, role: 'admin' })).rejects.toThrow(/admin/i)
  })
})

describe('removerUsuario', () => {
  it('remove auth + linha usuarios; bloqueia remover a si mesmo e o admin', async () => {
    const admin = await makeUser('admin')
    const email = `rm-${Date.now()}@iagentics.test`
    const { id } = await criarUsuario({ email, senha: 'senha-1234', nome: 'RM', role: 'leitura' }, { id: admin.id, role: 'admin' })

    await removerUsuario(id, { id: admin.id, role: 'admin' })
    const { data: row } = await db().from('usuarios').select('id').eq('id', id).maybeSingle()
    expect(row).toBeNull()

    await expect(removerUsuario(admin.id, { id: admin.id, role: 'admin' })).rejects.toThrow(/si mesmo/i)
  })
})
