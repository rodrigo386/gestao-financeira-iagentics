import { z } from 'zod'

export const Uuid = z.string().uuid()

export const Money = z
  .number()
  .nonnegative()
  .refine((v) => Number.isFinite(v) && Math.round(v * 100) === v * 100, {
    message: 'must have at most 2 decimal places',
  })

const digits = (s: string) => s.replace(/\D/g, '')

export const Cnpj = z
  .string()
  .transform(digits)
  .refine((s) => s.length === 14, { message: 'cnpj must have 14 digits' })

export const Cpf = z
  .string()
  .transform(digits)
  .refine((s) => s.length === 11, { message: 'cpf must have 11 digits' })

export const Moeda = z.enum(['BRL', 'USD', 'EUR']).default('BRL')
