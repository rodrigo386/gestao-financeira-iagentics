import { z } from 'zod'
import { Uuid, Moeda, Cnpj } from './common'

export const ClienteStatus = z.enum(['ativo', 'inativo', 'churned'])

export const NewCliente = z.object({
  nome: z.string().min(1),
  cnpj: Cnpj.optional(),
  segmento: z.string().optional(),
  status: ClienteStatus.default('ativo'),
  moeda_padrao: Moeda,
  contato_email: z.string().email().optional(),
  contato_telefone: z.string().optional(),
  observacoes: z.string().optional(),
})

export const Cliente = NewCliente.extend({
  id: Uuid,
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewCliente = z.infer<typeof NewCliente>
export type Cliente = z.infer<typeof Cliente>
