import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { loadSnapshot } from '@/modules/forecast/snapshot'
import { gerarForecast } from '@/modules/forecast/engine'
import { Drivers } from '@/lib/schemas/cenario'
import { executarSqlReadonly } from './sql'

export const TOOLS_LEITURA: Anthropic.Tool[] = [
  {
    name: 'get_estado_atual',
    description: 'Estado financeiro atual: MRR, caixa, despesa mensal, AR/AP próximos 30 dias, contratos ativos.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_metricas_historico',
    description: 'Histórico de métricas mensais fechadas (MRR, receita, despesa, resultado, caixa, runway).',
    input_schema: { type: 'object', properties: { meses: { type: 'number', description: 'quantos meses recentes (default 12)' } } },
  },
  {
    name: 'simular_forecast',
    description: 'Simula projeção de 12 meses com drivers hipotéticos (what-if). Retorna projeção mensal e runway.',
    input_schema: {
      type: 'object',
      properties: {
        novos_clientes_mes: { type: 'number' }, churn_pct: { type: 'number' },
        ticket_medio_novo: { type: 'number' }, novos_projetos_mes: { type: 'number' },
        valor_medio_projeto: { type: 'number' }, duracao_projeto_meses: { type: 'number' },
        crescimento_despesa_pct: { type: 'number' },
      },
      required: ['novos_clientes_mes', 'churn_pct', 'ticket_medio_novo', 'novos_projetos_mes', 'valor_medio_projeto', 'duracao_projeto_meses', 'crescimento_despesa_pct'],
    },
  },
  {
    name: 'query_sql',
    description: 'Executa um SELECT read-only no banco para perguntas descritivas não cobertas pelas outras tools. Use nomes de tabela em snake_case (ex: contratos, lancamentos, contas_a_pagar).',
    input_schema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
  },
]

function primeiroDiaMesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function executarToolLeitura(name: string, input: unknown): Promise<unknown> {
  const admin = createServiceClient()
  switch (name) {
    case 'get_estado_atual':
      return loadSnapshot(primeiroDiaMesAtual())
    case 'get_metricas_historico': {
      const meses = (input as { meses?: number })?.meses ?? 12
      const { data } = await admin
        .from('metricas_mensais').select('*').order('mes_ref', { ascending: false }).limit(meses)
      return data ?? []
    }
    case 'simular_forecast': {
      const drivers = Drivers.parse(input)
      const snap = await loadSnapshot(primeiroDiaMesAtual())
      const proj = gerarForecast(snap, drivers, primeiroDiaMesAtual(), 12)
      return { runway_meses: proj[0]?.runway_meses ?? null, projecao: proj }
    }
    case 'query_sql':
      return executarSqlReadonly((input as { sql: string }).sql)
    default:
      throw new Error(`tool de leitura desconhecida: ${name}`)
  }
}
