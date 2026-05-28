import { z } from 'zod'
import { Uuid } from './common'

export const Drivers = z.object({
  novos_clientes_mes: z.number().nonnegative(),
  churn_pct: z.number().min(0).max(100),
  ticket_medio_novo: z.number().nonnegative(),
  novos_projetos_mes: z.number().nonnegative(),
  valor_medio_projeto: z.number().nonnegative(),
  duracao_projeto_meses: z.number().int().min(1),
  crescimento_despesa_pct: z.number().min(-100).max(100),
})

export const NewCenario = z.object({
  nome: z.string().min(1),
  drivers_json: Drivers,
  ativo: z.boolean().default(true),
})

export const Cenario = NewCenario.extend({
  id: Uuid,
  ativo: z.boolean(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type Drivers = z.infer<typeof Drivers>
export type NewCenario = z.infer<typeof NewCenario>
export type Cenario = z.infer<typeof Cenario>

export type Projecao = {
  cenario_id: string
  mes_ref: string
  mrr: number
  receita_total: number
  despesa_total: number
  caixa: number
  runway_meses: number | null
}
