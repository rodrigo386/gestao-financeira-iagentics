import 'server-only'
import { z } from 'zod'

export const CategoriaSuggestion = z.object({
  categoria_id: z.string().uuid().nullable(),
  confianca: z.number().min(0).max(1),
  justificativa: z.string().max(300),
})

export type CategoriaSuggestion = z.infer<typeof CategoriaSuggestion>

export const BreakClassification = z.object({
  classificacao: z.enum([
    'matched', 'timing-break', 'amount-break', 'mapping-issue',
    'duplicate', 'bank-only', 'ledger-only',
  ]),
  melhor_match_id: z.string().uuid().nullable(),
  score: z.number().min(0).max(1),
  explicacao: z.string().max(300),
})

export type BreakClassification = z.infer<typeof BreakClassification>

export const CommentaryResult = z.object({
  resumo: z.string().min(1).max(2000),
  destaques: z.array(
    z.object({
      linha: z.string(),
      driver: z.string(),
      magnitude: z.string(),
    }),
  ),
})

export type CommentaryResult = z.infer<typeof CommentaryResult>
