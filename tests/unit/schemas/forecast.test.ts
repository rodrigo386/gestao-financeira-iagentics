import { describe, it, expect } from 'vitest'
import { NewCenario, Drivers } from '@/lib/schemas/cenario'
import { NewAlerta } from '@/lib/schemas/alerta'

describe('Drivers', () => {
  const valid = {
    novos_clientes_mes: 1,
    churn_pct: 2,
    ticket_medio_novo: 1500,
    novos_projetos_mes: 0.5,
    valor_medio_projeto: 30000,
    duracao_projeto_meses: 3,
    crescimento_despesa_pct: 1,
  }
  it('accepts valid drivers', () => {
    expect(Drivers.safeParse(valid).success).toBe(true)
  })
  it('rejects churn_pct > 100', () => {
    expect(Drivers.safeParse({ ...valid, churn_pct: 150 }).success).toBe(false)
  })
  it('rejects negative novos_clientes_mes', () => {
    expect(Drivers.safeParse({ ...valid, novos_clientes_mes: -1 }).success).toBe(false)
  })
})

describe('NewCenario', () => {
  it('accepts valid', () => {
    expect(NewCenario.safeParse({
      nome: 'Custom',
      drivers_json: {
        novos_clientes_mes: 1, churn_pct: 2, ticket_medio_novo: 1500,
        novos_projetos_mes: 0.5, valor_medio_projeto: 30000,
        duracao_projeto_meses: 3, crescimento_despesa_pct: 1,
      },
    }).success).toBe(true)
  })
})

describe('NewAlerta', () => {
  it('accepts valid', () => {
    expect(NewAlerta.safeParse({
      tipo: 'runway_critico',
      severidade: 'critical',
      titulo: 'Runway abaixo de 6 meses',
      mensagem: 'O cenário Base projeta runway de 4 meses',
    }).success).toBe(true)
  })
  it('rejects invalid tipo', () => {
    expect(NewAlerta.safeParse({
      tipo: 'invalido',
      severidade: 'info',
      titulo: 'X',
      mensagem: 'Y',
    }).success).toBe(false)
  })
})
