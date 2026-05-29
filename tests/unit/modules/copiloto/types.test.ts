import { describe, it, expect } from 'vitest'
import { ProposedActionSchema } from '@/modules/copiloto/types'

const driversOk = {
  novos_clientes_mes: 2, churn_pct: 1, ticket_medio_novo: 15000,
  novos_projetos_mes: 0, valor_medio_projeto: 0, duracao_projeto_meses: 1,
  crescimento_despesa_pct: 5,
}

describe('ProposedActionSchema', () => {
  it('valida salvar_cenario', () => {
    const r = ProposedActionSchema.safeParse({ tipo: 'salvar_cenario', nome: 'Contratar 2 devs', drivers: driversOk })
    expect(r.success).toBe(true)
  })

  it('valida fechar_mes', () => {
    expect(ProposedActionSchema.safeParse({ tipo: 'fechar_mes', mes_ref: '2026-04-01' }).success).toBe(true)
  })

  it('valida marcar_alertas_lidos', () => {
    expect(ProposedActionSchema.safeParse({ tipo: 'marcar_alertas_lidos', ids: [crypto.randomUUID()] }).success).toBe(true)
  })

  it('valida criar_regra', () => {
    expect(ProposedActionSchema.safeParse({ tipo: 'criar_regra', padrao: 'AWS', categoria_id: crypto.randomUUID() }).success).toBe(true)
  })

  it('rejeita tipo desconhecido', () => {
    expect(ProposedActionSchema.safeParse({ tipo: 'transferir_dinheiro', valor: 999 }).success).toBe(false)
  })

  it('rejeita params faltando', () => {
    expect(ProposedActionSchema.safeParse({ tipo: 'fechar_mes' }).success).toBe(false)
  })
})
