import { z } from 'zod'
import { Uuid, Money, Moeda } from './common'

export const APTipoCredor = z.enum(['fornecedor', 'funcionario', 'pj_spot', 'orgao_publico'])
export const APOrigem = z.enum(['recorrente', 'folha', 'alocacao_pj', 'nf', 'avulso'])
export const APStatus = z.enum(['previsto', 'aprovado', 'pago', 'atrasado', 'cancelado'])

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewContaAPagar = z.object({
  tipo_credor: APTipoCredor,
  credor_id: Uuid.optional(),
  origem: APOrigem,
  origem_id: Uuid.optional(),
  descricao: z.string().min(1),
  valor: Money.refine((v) => v > 0, 'valor must be > 0'),
  moeda: Moeda,
  data_vencimento: DateStr,
  categoria_id: Uuid.optional(),
  status: APStatus.default('previsto'),
  observacoes: z.string().optional(),
  anexo_path: z.string().optional(),
})

export const ContaAPagar = z.object({
  id: Uuid,
  tipo_credor: APTipoCredor,
  credor_id: Uuid.nullable(),
  origem: APOrigem,
  origem_id: Uuid.nullable(),
  descricao: z.string(),
  valor: Money,
  moeda: z.string(),
  data_vencimento: DateStr,
  categoria_id: Uuid.nullable(),
  status: APStatus,
  data_pagamento: DateStr.nullable(),
  lancamento_id: Uuid.nullable(),
  aprovador_id: Uuid.nullable(),
  aprovado_em: z.string().nullable(),
  anexo_path: z.string().nullable(),
  observacoes: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewContaAPagar = z.infer<typeof NewContaAPagar>
export type ContaAPagar = z.infer<typeof ContaAPagar>
