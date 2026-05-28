import { z } from 'zod'
import { Uuid } from './common'

export const PluggyItemStatus = z.enum([
  'updating', 'updated', 'login_error', 'waiting_user_input', 'outdated', 'error',
])

export const NewPluggyItem = z.object({
  pluggy_item_id: z.string().min(1),
  conta_bancaria_id: Uuid.optional(),
  banco_nome: z.string().min(1),
  status: PluggyItemStatus.default('updating'),
  last_error: z.string().optional(),
})

export const PluggyItem = NewPluggyItem.extend({
  id: Uuid,
  status: PluggyItemStatus,
  last_synced_at: z.string().nullable(),
  last_error: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewPluggyItem = z.infer<typeof NewPluggyItem>
export type PluggyItem = z.infer<typeof PluggyItem>
