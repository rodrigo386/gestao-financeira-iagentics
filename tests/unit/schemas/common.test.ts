import { describe, it, expect } from 'vitest'
import { Uuid, Money, Cnpj, Cpf } from '@/lib/schemas/common'

describe('Uuid', () => {
  it('accepts valid v4 uuid', () => {
    expect(Uuid.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true)
  })
  it('rejects non-uuid', () => {
    expect(Uuid.safeParse('abc').success).toBe(false)
  })
})

describe('Money', () => {
  it('accepts positive decimal up to 2dp', () => {
    expect(Money.safeParse(100).success).toBe(true)
    expect(Money.safeParse(100.50).success).toBe(true)
  })
  it('rejects negative', () => {
    expect(Money.safeParse(-1).success).toBe(false)
  })
  it('rejects >2 decimal places', () => {
    expect(Money.safeParse(1.234).success).toBe(false)
  })
})

describe('Cnpj', () => {
  it('accepts 14-digit cnpj', () => {
    expect(Cnpj.safeParse('12345678000190').success).toBe(true)
  })
  it('accepts formatted cnpj', () => {
    expect(Cnpj.safeParse('12.345.678/0001-90').success).toBe(true)
  })
  it('rejects too short', () => {
    expect(Cnpj.safeParse('123').success).toBe(false)
  })
})

describe('Cpf', () => {
  it('accepts 11-digit cpf', () => {
    expect(Cpf.safeParse('12345678901').success).toBe(true)
  })
  it('rejects too short', () => {
    expect(Cpf.safeParse('123').success).toBe(false)
  })
})
