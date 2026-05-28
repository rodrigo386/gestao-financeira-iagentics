import { z } from 'zod'
import { Uuid, Money, Moeda } from './common'

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewDespesaRecorrente = z.object({
  fornecedor_id: Uuid,
  descricao: z.string().min(1),
  valor: Money.refine((v) => v > 0, 'valor must be > 0'),
  moeda: Moeda,
  dia_mes: z.number().int().min(1).max(28),
  categoria_id: Uuid.optional(),
  data_inicio: DateStr,
  data_fim: DateStr.optional(),
  ativa: z.boolean().default(true),
  proxima_geracao: DateStr,
  observacoes: z.string().optional(),
})

export const DespesaRecorrente = NewDespesaRecorrente.extend({
  id: Uuid,
  ativa: z.boolean(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewDespesaRecorrente = z.infer<typeof NewDespesaRecorrente>
export type DespesaRecorrente = z.infer<typeof DespesaRecorrente>
