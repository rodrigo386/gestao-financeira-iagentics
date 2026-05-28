import { describe, it, expect } from 'vitest'
import { NewFuncionario } from '@/lib/schemas/funcionario'
import { NewPJSpot, NewAlocacao } from '@/lib/schemas/pj-spot'
import { NewFolha, NewItemFolha } from '@/lib/schemas/folha'

describe('NewFuncionario', () => {
  const valid = {
    nome: 'João Silva',
    cargo: 'Engenheiro',
    tipo: 'clt' as const,
    salario_base: 10000,
    data_admissao: '2025-01-15',
  }
  it('accepts valid', () => {
    expect(NewFuncionario.safeParse(valid).success).toBe(true)
  })
  it('rejects negative salário', () => {
    expect(NewFuncionario.safeParse({ ...valid, salario_base: -1 }).success).toBe(false)
  })
  it('rejects desligamento before admissão', () => {
    expect(NewFuncionario.safeParse({
      ...valid, data_desligamento: '2024-12-01',
    }).success).toBe(false)
  })
})

describe('NewPJSpot', () => {
  it('accepts minimal', () => {
    expect(NewPJSpot.safeParse({ nome: 'Maria PJ' }).success).toBe(true)
  })
})

describe('NewAlocacao', () => {
  const valid = {
    pj_id: '550e8400-e29b-41d4-a716-446655440000',
    descricao: 'Desenvolvimento sprint 1',
    tipo_remuneracao: 'fixo' as const,
    valor_total: 5000,
    data_inicio: '2026-05-01',
    data_prevista_fim: '2026-05-30',
  }
  it('accepts valid', () => {
    expect(NewAlocacao.safeParse(valid).success).toBe(true)
  })
  it('rejects fim before inicio', () => {
    expect(NewAlocacao.safeParse({ ...valid, data_prevista_fim: '2026-04-01' }).success).toBe(false)
  })
})

describe('NewFolha', () => {
  it('accepts dia=1 mes_ref', () => {
    expect(NewFolha.safeParse({ mes_ref: '2026-05-01' }).success).toBe(true)
  })
  it('rejects mes_ref not on day 1', () => {
    expect(NewFolha.safeParse({ mes_ref: '2026-05-15' }).success).toBe(false)
  })
})

describe('NewItemFolha', () => {
  it('accepts valid', () => {
    expect(NewItemFolha.safeParse({
      folha_id: '550e8400-e29b-41d4-a716-446655440000',
      funcionario_id: '550e8400-e29b-41d4-a716-446655440001',
      salario_bruto: 10000,
      beneficios_valor: 800,
      inss_funcionario: 1100,
      irrf: 500,
      liquido_pagar: 8400,
      fgts: 800,
      inss_patronal: 2000,
      provisao_13: 833,
      provisao_ferias: 1111,
      total_encargos: 4744,
    }).success).toBe(true)
  })
})
