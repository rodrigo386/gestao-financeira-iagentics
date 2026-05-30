import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { withAudit } from '@/lib/audit'
import {
  CriarUsuarioSchema,
  RedefinirSenhaSchema,
  TrocarRoleSchema,
  type CriarUsuarioInput,
  type RedefinirSenhaInput,
  type TrocarRoleInput,
  type Actor,
  type UsuarioListItem,
} from './types'

function requireAdmin(actor: Actor) {
  if (actor.role !== 'admin') throw new Error('apenas admin pode gerenciar usuários')
}

export async function listarUsuarios(actor: Actor): Promise<UsuarioListItem[]> {
  requireAdmin(actor)
  const admin = createServiceClient()
  const { data: rows, error } = await admin.from('usuarios').select('id, nome, role').order('nome')
  if (error) throw new Error(`listarUsuarios: ${error.message}`)
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const emailById = new Map((list?.users ?? []).map((u) => [u.id, u.email ?? null]))
  return (rows ?? []).map((r) => ({ id: r.id, nome: r.nome, role: r.role, email: emailById.get(r.id) ?? null }))
}

export async function criarUsuario(input: CriarUsuarioInput, actor: Actor): Promise<{ id: string }> {
  requireAdmin(actor)
  const { email, senha, nome, role } = CriarUsuarioSchema.parse(input)
  const admin = createServiceClient()

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  })
  if (createErr || !created.user) throw new Error(`criarUsuario: ${createErr?.message ?? 'falha ao criar'}`)
  const id = created.user.id

  return withAudit(
    {
      usuario_id: actor.id,
      acao: 'insert',
      tabela: 'usuarios',
      registro_id: id,
      before: null,
      after: { nome, role, email },
      motivo: 'admin: criar usuário',
    },
    async () => {
      const { error } = await admin.from('usuarios').insert({ id, nome, role })
      if (error) {
        // limpa o auth user órfão para que re-tentativas fiquem limpas
        await admin.auth.admin.deleteUser(id)
        throw new Error(`criarUsuario (usuarios): ${error.message}`)
      }
      return { id }
    },
  )
}

export async function redefinirSenha(input: RedefinirSenhaInput, actor: Actor): Promise<void> {
  requireAdmin(actor)
  const { userId, novaSenha } = RedefinirSenhaSchema.parse(input)
  const admin = createServiceClient()
  await withAudit(
    {
      usuario_id: actor.id,
      acao: 'update',
      tabela: 'usuarios',
      registro_id: userId,
      before: null,
      after: { senha: '***' },
      motivo: 'admin: redefinir senha',
    },
    async () => {
      const { error } = await admin.auth.admin.updateUserById(userId, { password: novaSenha })
      if (error) throw new Error(`redefinirSenha: ${error.message}`)
    },
  )
}

export async function trocarRole(input: TrocarRoleInput, actor: Actor): Promise<void> {
  requireAdmin(actor)
  const { userId, role } = TrocarRoleSchema.parse(input)
  const admin = createServiceClient()
  const { data: alvo } = await admin.from('usuarios').select('role').eq('id', userId).single()
  if (alvo?.role === 'admin') throw new Error('não é possível alterar a role do admin')
  await withAudit(
    {
      usuario_id: actor.id,
      acao: 'update',
      tabela: 'usuarios',
      registro_id: userId,
      before: { role: alvo?.role ?? null },
      after: { role },
      motivo: 'admin: trocar role',
    },
    async () => {
      const { error } = await admin.from('usuarios').update({ role }).eq('id', userId)
      if (error) throw new Error(`trocarRole: ${error.message}`)
    },
  )
}

export async function removerUsuario(userId: string, actor: Actor): Promise<void> {
  requireAdmin(actor)
  if (userId === actor.id) throw new Error('não é possível remover a si mesmo')
  const admin = createServiceClient()
  const { data: alvo } = await admin.from('usuarios').select('role').eq('id', userId).single()
  if (alvo?.role === 'admin') throw new Error('não é possível remover o admin')
  await withAudit(
    {
      usuario_id: actor.id,
      acao: 'delete',
      tabela: 'usuarios',
      registro_id: userId,
      before: { role: alvo?.role ?? null },
      after: null,
      motivo: 'admin: remover usuário',
    },
    async () => {
      // ordem determinística: linha usuarios primeiro, depois o auth user
      const { error: delRow } = await admin.from('usuarios').delete().eq('id', userId)
      if (delRow) throw new Error(`removerUsuario (usuarios): ${delRow.message}`)
      const { error: delAuth } = await admin.auth.admin.deleteUser(userId)
      if (delAuth) throw new Error(`removerUsuario (auth): ${delAuth.message}`)
    },
  )
}
