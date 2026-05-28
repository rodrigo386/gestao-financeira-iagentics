import { z } from 'zod'
import { Uuid } from './common'

export const AlertaSeveridade = z.enum(['info', 'warning', 'critical'])
export const AlertaTipo = z.enum([
  'runway_critico', 'runway_atencao', 'ap_atrasada', 'ar_atrasada',
  'contrato_vencendo', 'despesa_anomala', 'caixa_baixo',
])

export const NewAlerta = z.object({
  tipo: AlertaTipo,
  severidade: AlertaSeveridade,
  titulo: z.string().min(1),
  mensagem: z.string().min(1),
  contexto_json: z.record(z.string(), z.unknown()).optional(),
})

export const Alerta = NewAlerta.extend({
  id: Uuid,
  contexto_json: z.record(z.string(), z.unknown()).nullable(),
  lido: z.boolean(),
  lido_em: z.string().nullable(),
  lido_por: Uuid.nullable(),
  criado_em: z.string(),
})

export type NewAlerta = z.infer<typeof NewAlerta>
export type Alerta = z.infer<typeof Alerta>
