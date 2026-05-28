import { z } from 'zod'
import { Uuid, Money, Moeda } from './common'

export const ContratoTipo = z.enum(['mensal', 'anual'])
export const ContratoStatus = z.enum(['ativo', 'pausado', 'churned'])

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewContrato = z.object({
  cliente_id: Uuid,
  nome: z.string().min(1),
  tipo: ContratoTipo.default('mensal'),
  ticket: Money,
  moeda: Moeda,
  dia_cobranca: z.number().int().min(1).max(28),
  data_inicio: DateStr,
  data_fim: DateStr.optional(),
  status: ContratoStatus.default('ativo'),
  observacoes: z.string().optional(),
}).refine(
  (v) => !v.data_fim || v.data_fim >= v.data_inicio,
  { message: 'data_fim must be on or after data_inicio', path: ['data_fim'] },
)

export const Contrato = z.object({
  id: Uuid,
  cliente_id: Uuid,
  nome: z.string(),
  tipo: ContratoTipo,
  ticket: Money,
  moeda: z.string(),
  dia_cobranca: z.number().int(),
  data_inicio: DateStr,
  data_fim: DateStr.nullable(),
  status: ContratoStatus,
  motivo_churn: z.string().nullable(),
  data_churn: DateStr.nullable(),
  observacoes: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewContrato = z.infer<typeof NewContrato>
export type Contrato = z.infer<typeof Contrato>
