import { z } from 'zod'

export const ROLES_ATRIBUIVEIS = ['financeiro', 'leitura'] as const
export type RoleAtribuivel = (typeof ROLES_ATRIBUIVEIS)[number]

export const CriarUsuarioSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  nome: z.string().min(1, 'Nome obrigatório'),
  role: z.enum(ROLES_ATRIBUIVEIS),
})
export type CriarUsuarioInput = z.infer<typeof CriarUsuarioSchema>

export const RedefinirSenhaSchema = z.object({
  userId: z.string().uuid(),
  novaSenha: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
})
export type RedefinirSenhaInput = z.infer<typeof RedefinirSenhaSchema>

export const TrocarRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES_ATRIBUIVEIS),
})
export type TrocarRoleInput = z.infer<typeof TrocarRoleSchema>

export type Actor = { id: string; role: string }

export type UsuarioListItem = {
  id: string
  nome: string
  role: string
  email: string | null
}
