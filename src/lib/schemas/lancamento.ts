import { z } from 'zod'
import { Uuid, Money } from './common'

export const LancamentoTipo = z.enum(['entrada', 'saida', 'transferencia'])
export const LancamentoOrigem = z.enum(['manual', 'ar', 'ap', 'pluggy', 'estorno'])

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewLancamento = z.object({
  data: DateStr,
  valor: Money.refine((v) => v > 0, 'valor must be > 0'),
  conta_id: Uuid,
  tipo: LancamentoTipo,
  categoria_id: Uuid.optional(),
  descricao: z.string().min(1),
  origem: LancamentoOrigem.default('manual'),
  origem_id: Uuid.optional(),
  fornecedor_id: Uuid.optional(),
  cliente_id: Uuid.optional(),
  projeto_id: Uuid.optional(),
  conciliado: z.boolean().optional(),
  pluggy_transaction_id: z.string().optional(),
  categorizacao_metodo: z.enum(['manual', 'regra', 'historico', 'llm']).optional(),
  categorizacao_confianca: z.number().min(0).max(1).optional(),
})

export const Lancamento = NewLancamento.extend({
  id: Uuid,
  conciliado: z.boolean(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewLancamento = z.infer<typeof NewLancamento>
export type Lancamento = z.infer<typeof Lancamento>
