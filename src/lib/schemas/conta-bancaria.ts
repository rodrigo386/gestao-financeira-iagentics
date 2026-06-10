import { z } from 'zod'

export const ContaTipo = z.enum(['cc', 'poupanca', 'investimento'])

// saldo pode ser negativo (cheque especial); no máximo 2 casas decimais
const Saldo = z.number().refine((v) => Math.round(v * 100) === v * 100, 'máximo 2 casas decimais')

export const NewContaBancaria = z.object({
  banco: z.string().min(1, 'Banco obrigatório'),
  agencia: z.string().optional(),
  conta: z.string().optional(),
  tipo: ContaTipo.default('cc'),
  saldo_atual: Saldo,
  ativa: z.boolean().default(true),
})

export const AtualizarContaPatch = z.object({
  banco: z.string().min(1).optional(),
  agencia: z.string().optional(),
  conta: z.string().optional(),
  tipo: ContaTipo.optional(),
  saldo_atual: Saldo.optional(),
  ativa: z.boolean().optional(),
})

export type NewContaBancaria = z.infer<typeof NewContaBancaria>
export type AtualizarContaPatch = z.infer<typeof AtualizarContaPatch>
