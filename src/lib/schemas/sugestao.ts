import { z } from 'zod'
import { Uuid } from './common'

export const BreakTipo = z.enum([
  'matched', 'timing-break', 'amount-break', 'mapping-issue',
  'duplicate', 'bank-only', 'ledger-only',
])
export const SugestaoStatus = z.enum(['pendente', 'aceita', 'rejeitada'])

export const NewSugestao = z.object({
  lancamento_id: Uuid,
  candidato_tipo: z.enum(['ap', 'ar']).optional(),
  candidato_id: Uuid.optional(),
  break_tipo: BreakTipo,
  score: z.number().min(0).max(1),
  explicacao: z.string().optional(),
  status: SugestaoStatus.default('pendente'),
})

export const Sugestao = NewSugestao.extend({
  id: Uuid,
  status: SugestaoStatus,
  resolvida_em: z.string().nullable(),
  resolvida_por: Uuid.nullable(),
  criado_em: z.string(),
})

export type NewSugestao = z.infer<typeof NewSugestao>
export type Sugestao = z.infer<typeof Sugestao>
