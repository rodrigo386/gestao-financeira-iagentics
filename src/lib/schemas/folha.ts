import { z } from 'zod'
import { Uuid, Money } from './common'

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const FolhaStatus = z.enum(['aberta', 'fechada'])

export const NewFolha = z.object({
  mes_ref: DateStr.refine((s) => s.endsWith('-01'), 'mes_ref must be on day 01'),
  status: FolhaStatus.default('aberta'),
  observacoes: z.string().optional(),
})

export const Folha = z.object({
  id: Uuid,
  mes_ref: DateStr,
  status: FolhaStatus,
  gerada_em: z.string(),
  fechada_em: z.string().nullable(),
  fechada_por: Uuid.nullable(),
  observacoes: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export const NewItemFolha = z.object({
  folha_id: Uuid,
  funcionario_id: Uuid,
  salario_bruto: Money,
  beneficios_valor: Money,
  inss_funcionario: Money,
  irrf: Money,
  outros_descontos_json: z.record(z.string(), z.unknown()).optional(),
  liquido_pagar: Money,
  fgts: Money,
  inss_patronal: Money,
  provisao_13: Money,
  provisao_ferias: Money,
  total_encargos: Money,
})

export const ItemFolha = NewItemFolha.extend({
  id: Uuid,
  outros_descontos_json: z.record(z.string(), z.unknown()),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewFolha = z.infer<typeof NewFolha>
export type Folha = z.infer<typeof Folha>
export type NewItemFolha = z.infer<typeof NewItemFolha>
export type ItemFolha = z.infer<typeof ItemFolha>
