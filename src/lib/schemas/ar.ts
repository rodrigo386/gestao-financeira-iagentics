import { z } from 'zod'
import { Uuid, Money, Moeda } from './common'

export const AROrigem = z.enum(['contrato', 'milestone', 'avulso'])
export const ARStatus = z.enum(['previsto', 'emitido', 'recebido', 'atrasado', 'cancelado'])

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewContaAReceber = z.object({
  cliente_id: Uuid,
  origem: AROrigem,
  origem_id: Uuid.optional(),
  valor: Money.refine((v) => v > 0, 'valor must be > 0'),
  moeda: Moeda,
  data_emissao: DateStr,
  data_vencimento: DateStr,
  status: ARStatus.default('previsto'),
  observacoes: z.string().optional(),
})
  .refine(
    (v) => v.origem === 'avulso' || !!v.origem_id,
    { message: 'origem_id required for non-avulso origem', path: ['origem_id'] },
  )
  .refine(
    (v) => v.data_vencimento >= v.data_emissao,
    { message: 'data_vencimento must be on or after data_emissao', path: ['data_vencimento'] },
  )

export const AtualizarARPatch = z.object({
  data_emissao: DateStr.optional(),
  data_vencimento: DateStr.optional(),
  valor: Money.refine((v) => v > 0, 'valor deve ser > 0').optional(),
  status: z.enum(['previsto', 'emitido', 'atrasado', 'cancelado']).optional(),
})
export type AtualizarARPatch = z.infer<typeof AtualizarARPatch>

export const ContaAReceber = z.object({
  id: Uuid,
  cliente_id: Uuid,
  origem: AROrigem,
  origem_id: Uuid.nullable(),
  valor: Money,
  moeda: z.string(),
  data_emissao: DateStr,
  data_vencimento: DateStr,
  status: ARStatus,
  data_recebimento: DateStr.nullable(),
  lancamento_id: Uuid.nullable(),
  nf_externa_id: z.string().nullable(),
  nf_url: z.string().nullable(),
  observacoes: z.string().nullable(),
  anexo_path: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewContaAReceber = z.infer<typeof NewContaAReceber>
export type ContaAReceber = z.infer<typeof ContaAReceber>
