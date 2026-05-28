import { z } from 'zod'
import { Uuid } from './common'

export const RegraPatternTipo = z.enum(['contains', 'regex', 'starts_with', 'exact'])
export const RegraCampo = z.enum(['descricao', 'fornecedor_nome'])
export const RegraOrigem = z.enum(['manual', 'auto_aprendida'])

export const NewRegra = z.object({
  prioridade: z.number().int().default(100),
  pattern: z.string().min(1),
  pattern_tipo: RegraPatternTipo.default('contains'),
  campo: RegraCampo.default('descricao'),
  categoria_id: Uuid,
  fornecedor_id: Uuid.optional(),
  origem: RegraOrigem.default('manual'),
  ativa: z.boolean().default(true),
})

export const Regra = NewRegra.extend({
  id: Uuid,
  ativa: z.boolean(),
  total_aplicacoes: z.number().int(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewRegra = z.infer<typeof NewRegra>
export type Regra = z.infer<typeof Regra>
