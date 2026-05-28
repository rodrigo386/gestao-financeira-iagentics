import { z } from 'zod'
import { Uuid, Cnpj } from './common'

export const NewFornecedor = z.object({
  nome: z.string().min(1),
  cnpj: Cnpj.optional(),
  categoria_default_id: Uuid.optional(),
  contato_email: z.string().email().optional(),
  contato_telefone: z.string().optional(),
  observacoes: z.string().optional(),
  ativo: z.boolean().default(true),
})

export const Fornecedor = NewFornecedor.extend({
  id: Uuid,
  ativo: z.boolean(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewFornecedor = z.infer<typeof NewFornecedor>
export type Fornecedor = z.infer<typeof Fornecedor>
