import { z } from 'zod'
import { Uuid, Money } from './common'

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewPJSpot = z.object({
  nome: z.string().min(1),
  cpf_cnpj: z.string().optional(),
  especialidade: z.string().optional(),
  contato_email: z.string().email().optional(),
  contato_telefone: z.string().optional(),
  valor_hora_padrao: Money.optional(),
  ativo: z.boolean().default(true),
})

export const PJSpot = NewPJSpot.extend({
  id: Uuid,
  ativo: z.boolean(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export const AlocacaoRemuneracao = z.enum(['fixo', 'hora', 'entregavel'])
export const AlocacaoStatus = z.enum(['contratado', 'em_andamento', 'concluido', 'pago'])

export const NewAlocacao = z.object({
  pj_id: Uuid,
  projeto_id: Uuid.optional(),
  descricao: z.string().min(1),
  escopo: z.string().optional(),
  tipo_remuneracao: AlocacaoRemuneracao.default('fixo'),
  valor_total: Money,
  horas_estimadas: z.number().nonnegative().optional(),
  horas_realizadas: z.number().nonnegative().optional(),
  data_inicio: DateStr,
  data_prevista_fim: DateStr,
  status: AlocacaoStatus.default('contratado'),
}).refine(
  (v) => v.data_prevista_fim >= v.data_inicio,
  { message: 'data_prevista_fim must be on or after data_inicio', path: ['data_prevista_fim'] },
)

export const Alocacao = z.object({
  id: Uuid,
  pj_id: Uuid,
  projeto_id: Uuid.nullable(),
  descricao: z.string(),
  escopo: z.string().nullable(),
  tipo_remuneracao: AlocacaoRemuneracao,
  valor_total: z.number(),
  horas_estimadas: z.number().nullable(),
  horas_realizadas: z.number().nullable(),
  data_inicio: DateStr,
  data_prevista_fim: DateStr,
  status: AlocacaoStatus,
  ap_id: Uuid.nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewPJSpot = z.infer<typeof NewPJSpot>
export type PJSpot = z.infer<typeof PJSpot>
export type NewAlocacao = z.infer<typeof NewAlocacao>
export type Alocacao = z.infer<typeof Alocacao>
