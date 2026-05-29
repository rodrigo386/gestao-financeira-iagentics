import 'server-only'
import type { Contrato } from '@/lib/schemas/contrato'
import { calcularMRR, calcularARR, calcularChurnRate } from '@/modules/receitas/metricas'
import { createServiceClient } from '@/lib/supabase/service'

export type MetricasMes = {
  mes_ref: string
  mrr: number
  arr: number
  receita_total: number
  despesa_total: number
  resultado: number
  caixa_fim: number
  runway_meses: number | null
  contratos_ativos: number
  churn_rate: number
}

type MontarInput = {
  mesRef: string
  contratos: Contrato[]
  lancamentos: { tipo: 'entrada' | 'saida'; valor: number }[]
  caixaFim: number
}

/** Pure: monta as métricas realizadas de um mês a partir de linhas já carregadas. */
export function montarMetricas(input: MontarInput): MetricasMes {
  const fimMes = lastDayOfMonth(input.mesRef)
  const receita_total = round2(sumByTipo(input.lancamentos, 'entrada'))
  const despesa_total = round2(sumByTipo(input.lancamentos, 'saida'))
  const resultado = round2(receita_total - despesa_total)
  const caixa_fim = round2(input.caixaFim)

  let runway_meses: number | null = null
  if (despesa_total > 0) {
    const q = caixa_fim / despesa_total
    runway_meses = q > 36 ? null : Math.round(q * 10) / 10
  }

  return {
    mes_ref: input.mesRef,
    mrr: round2(calcularMRR(input.contratos, fimMes)),
    arr: round2(calcularARR(input.contratos, fimMes)),
    receita_total,
    despesa_total,
    resultado,
    caixa_fim,
    runway_meses,
    contratos_ativos: input.contratos.filter((c) => isAtivoNaData(c, fimMes)).length,
    churn_rate: round4(calcularChurnRate(input.contratos, input.mesRef)),
  }
}

function sumByTipo(rows: { tipo: 'entrada' | 'saida'; valor: number }[], tipo: 'entrada' | 'saida'): number {
  return rows.filter((r) => r.tipo === tipo).reduce((s, r) => s + r.valor, 0)
}

function isAtivoNaData(c: Contrato, refDate: string): boolean {
  if (c.status !== 'ativo') return false
  if (c.data_inicio > refDate) return false
  if (c.data_fim && c.data_fim < refDate) return false
  return true
}

function lastDayOfMonth(mesRef: string): string {
  const [y, m] = mesRef.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m!, 0)) // day 0 of next month = last day of this month
  return d.toISOString().slice(0, 10)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Carrega dados reais do mês e monta as métricas realizadas. */
export async function computeMetricasMes(mesRef: string): Promise<MetricasMes> {
  const admin = createServiceClient()
  const fimMes = addMonthsFirstDay(mesRef, 1)

  const { data: contratosRows } = await admin.from('contratos').select('*')
  const contratos = (contratosRows ?? []) as Contrato[]

  const { data: lancs } = await admin
    .from('lancamentos').select('tipo, valor')
    .gte('data', mesRef).lt('data', fimMes)
  const lancamentos = ((lancs ?? []) as { tipo: 'entrada' | 'saida'; valor: number | string }[])
    .map((l) => ({ tipo: l.tipo, valor: Number(l.valor) }))

  const { data: contas } = await admin
    .from('contas_bancarias').select('saldo_atual').eq('ativa', true)
  const caixaFim = (contas ?? []).reduce((s, c) => s + Number(c.saldo_atual), 0)

  return montarMetricas({ mesRef, contratos, lancamentos, caixaFim })
}

/** Primeiro dia do mês deslocado por `months` (positivo ou negativo). */
export function addMonthsFirstDay(mesRef: string, months: number): string {
  const [y, m] = mesRef.split('-').map(Number)
  const total = y! * 12 + (m! - 1) + months
  const yy = Math.floor(total / 12)
  const mm = (total % 12) + 1
  return `${yy}-${String(mm).padStart(2, '0')}-01`
}
