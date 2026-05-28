import { describe, it, expect } from 'vitest'
import { NewCliente } from '@/lib/schemas/cliente'
import { NewContrato } from '@/lib/schemas/contrato'
import { NewProjeto, NewMilestone } from '@/lib/schemas/projeto'
import { NewContaAReceber } from '@/lib/schemas/ar'

describe('NewCliente', () => {
  it('requires nome', () => {
    expect(NewCliente.safeParse({}).success).toBe(false)
  })
  it('accepts minimal cliente', () => {
    expect(NewCliente.safeParse({ nome: 'Acme' }).success).toBe(true)
  })
  it('accepts full cliente', () => {
    expect(NewCliente.safeParse({
      nome: 'Acme', cnpj: '12345678000190', segmento: 'tech',
      contato_email: 'a@b.com', moeda_padrao: 'BRL',
    }).success).toBe(true)
  })
  it('rejects invalid email', () => {
    expect(NewCliente.safeParse({ nome: 'Acme', contato_email: 'notanemail' }).success).toBe(false)
  })
})

describe('NewContrato', () => {
  const valid = {
    cliente_id: '550e8400-e29b-41d4-a716-446655440000',
    nome: 'AaaS Pro',
    tipo: 'mensal' as const,
    ticket: 500,
    dia_cobranca: 10,
    data_inicio: '2026-05-01',
  }
  it('accepts valid contrato', () => {
    expect(NewContrato.safeParse(valid).success).toBe(true)
  })
  it('rejects negative ticket', () => {
    expect(NewContrato.safeParse({ ...valid, ticket: -1 }).success).toBe(false)
  })
  it('rejects dia_cobranca > 28', () => {
    expect(NewContrato.safeParse({ ...valid, dia_cobranca: 31 }).success).toBe(false)
  })
})

describe('NewProjeto', () => {
  const valid = {
    cliente_id: '550e8400-e29b-41d4-a716-446655440000',
    nome: 'Implementação',
    valor_total: 50000,
    data_inicio: '2026-05-01',
    data_prevista_fim: '2026-08-01',
  }
  it('accepts valid projeto', () => {
    expect(NewProjeto.safeParse(valid).success).toBe(true)
  })
  it('rejects fim_before_inicio', () => {
    expect(NewProjeto.safeParse({ ...valid, data_prevista_fim: '2026-04-01' }).success).toBe(false)
  })
})

describe('NewMilestone', () => {
  it('accepts valid milestone', () => {
    expect(NewMilestone.safeParse({
      projeto_id: '550e8400-e29b-41d4-a716-446655440000',
      ordem: 1, descricao: 'Setup', valor: 10000,
      data_prevista: '2026-05-15',
    }).success).toBe(true)
  })
  it('rejects ordem < 1', () => {
    expect(NewMilestone.safeParse({
      projeto_id: '550e8400-e29b-41d4-a716-446655440000',
      ordem: 0, descricao: 'X', valor: 100, data_prevista: '2026-05-15',
    }).success).toBe(false)
  })
})

describe('NewContaAReceber', () => {
  const valid = {
    cliente_id: '550e8400-e29b-41d4-a716-446655440000',
    origem: 'avulso' as const,
    valor: 1000,
    data_emissao: '2026-05-01',
    data_vencimento: '2026-05-15',
  }
  it('accepts valid avulso AR', () => {
    expect(NewContaAReceber.safeParse(valid).success).toBe(true)
  })
  it('requires origem_id when not avulso', () => {
    expect(NewContaAReceber.safeParse({ ...valid, origem: 'contrato' }).success).toBe(false)
  })
  it('rejects vencimento before emissao', () => {
    expect(NewContaAReceber.safeParse({ ...valid, data_vencimento: '2026-04-01' }).success).toBe(false)
  })
})
