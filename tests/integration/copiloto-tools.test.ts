import { describe, it, expect } from 'vitest'
import { executarToolLeitura, TOOLS_LEITURA } from '@/modules/copiloto/tools-leitura'

const drivers = {
  novos_clientes_mes: 2, churn_pct: 1, ticket_medio_novo: 15000,
  novos_projetos_mes: 0, valor_medio_projeto: 0, duracao_projeto_meses: 1,
  crescimento_despesa_pct: 5,
}

describe('tools de leitura', () => {
  it('TOOLS_LEITURA tem 4 tools nomeadas', () => {
    expect(TOOLS_LEITURA.map((t) => t.name).sort()).toEqual(
      ['get_estado_atual', 'get_metricas_historico', 'query_sql', 'simular_forecast'],
    )
  })

  it('get_estado_atual retorna snapshot com mrrAtual', async () => {
    const r = (await executarToolLeitura('get_estado_atual', {})) as { mrrAtual: number }
    expect(typeof r.mrrAtual).toBe('number')
  })

  it('simular_forecast retorna projeção de 12 meses', async () => {
    const r = (await executarToolLeitura('simular_forecast', drivers)) as { projecao: unknown[] }
    expect(r.projecao.length).toBe(12)
  })

  it('query_sql retorna linhas', async () => {
    const r = (await executarToolLeitura('query_sql', { sql: 'select count(*)::int as n from contratos' })) as { linhas: { n: number }[] }
    expect(typeof r.linhas[0]!.n).toBe('number')
  })
})
