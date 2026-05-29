import { z } from 'zod'
import { Uuid } from '@/lib/schemas/common'
import { Drivers } from '@/lib/schemas/cenario'

export type Mensagem = { role: 'user' | 'assistant'; content: string }

export const ProposedActionSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('salvar_cenario'), nome: z.string().min(1), drivers: Drivers }),
  z.object({ tipo: z.literal('marcar_alertas_lidos'), ids: z.array(Uuid).min(1) }),
  z.object({ tipo: z.literal('fechar_mes'), mes_ref: z.string().regex(/^\d{4}-\d{2}-01$/) }),
  z.object({ tipo: z.literal('criar_regra'), padrao: z.string().min(1), categoria_id: Uuid }),
])

export type ProposedAction = z.infer<typeof ProposedActionSchema>

export type RespostaAgente = { mensagem: string; proposta?: ProposedAction }

export type ResultadoAcao = { ok: boolean; detalhe: string }
