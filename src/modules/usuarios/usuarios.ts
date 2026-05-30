import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { withAudit } from '@/lib/audit'
import {
  CriarUsuarioSchema,
  type CriarUsuarioInput,
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
