import { z } from 'zod'
import { Uuid, Money, Moeda } from './common'

export const ProjetoStatus = z.enum(['proposta', 'ativo', 'pausado', 'concluido', 'cancelado'])
export const MilestoneStatus = z.enum(['pendente', 'em_andamento', 'concluido', 'faturado', 'pago'])

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewProjeto = z.object({
  cliente_id: Uuid,
  nome: z.string().min(1),
  descricao: z.string().optional(),
  valor_total: Money,
  moeda: Moeda,
  data_inicio: DateStr,
  data_prevista_fim: DateStr,
  status: ProjetoStatus.default('proposta'),
  observacoes: z.string().optional(),
}).refine(
  (v) => v.data_prevista_fim >= v.data_inicio,
  { message: 'data_prevista_fim must be on or after data_inicio', path: ['data_prevista_fim'] },
)

export const NewMilestone = z.object({
  projeto_id: Uuid,
  ordem: z.number().int().min(1),
  descricao: z.string().min(1),
  valor: Money,
  data_prevista: DateStr,
  status: MilestoneStatus.default('pendente'),
})

export const Projeto = NewProjeto.extend({
  id: Uuid,
  data_real_fim: DateStr.nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export const Milestone = NewMilestone.extend({
  id: Uuid,
  data_real: DateStr.nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewProjeto = z.infer<typeof NewProjeto>
export type Projeto = z.infer<typeof Projeto>
export type NewMilestone = z.infer<typeof NewMilestone>
export type Milestone = z.infer<typeof Milestone>
