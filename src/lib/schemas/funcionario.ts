import { z } from 'zod'
import { Uuid, Money, Cpf } from './common'

export const FuncionarioTipo = z.enum(['clt', 'pj_recorrente'])

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewFuncionario = z.object({
  nome: z.string().min(1),
  cpf: Cpf.optional(),
  cargo: z.string().min(1),
  tipo: FuncionarioTipo.default('clt'),
  salario_base: Money,
  beneficios_json: z.record(z.string(), z.unknown()).optional(),
  encargos_pct_json: z.record(z.string(), z.unknown()).optional(),
  centro_custo: z.string().optional(),
  data_admissao: DateStr,
  data_desligamento: DateStr.optional(),
  ativo: z.boolean().default(true),
  chave_pix: z.string().optional(),
  banco_conta_json: z.record(z.string(), z.unknown()).optional(),
  usuario_id: Uuid.optional(),
}).refine(
  (v) => !v.data_desligamento || v.data_desligamento >= v.data_admissao,
  { message: 'data_desligamento must be on or after data_admissao', path: ['data_desligamento'] },
)

export const Funcionario = z.object({
  id: Uuid,
  nome: z.string(),
  cpf: z.string().nullable(),
  cargo: z.string(),
  tipo: FuncionarioTipo,
  salario_base: z.number(),
  beneficios_json: z.record(z.string(), z.unknown()),
  encargos_pct_json: z.record(z.string(), z.unknown()),
  centro_custo: z.string().nullable(),
  data_admissao: DateStr,
  data_desligamento: DateStr.nullable(),
  ativo: z.boolean(),
  chave_pix: z.string().nullable(),
  banco_conta_json: z.record(z.string(), z.unknown()).nullable(),
  usuario_id: Uuid.nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewFuncionario = z.infer<typeof NewFuncionario>
export type Funcionario = z.infer<typeof Funcionario>
