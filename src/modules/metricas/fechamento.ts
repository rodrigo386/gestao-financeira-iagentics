import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { computeMetricasMes, addMonthsFirstDay, type MetricasMes } from './snapshot'
import { gerarCommentary } from './commentary'

function rowToMetricas(row: Record<string, unknown>): MetricasMes {
  return {
    mes_ref: row.mes_ref as string,
    mrr: Number(row.mrr),
    arr: Number(row.arr),
    receita_total: Number(row.receita_total),
    despesa_total: Number(row.despesa_total),
    resultado: Number(row.resultado),
    caixa_fim: Number(row.caixa_fim),
    runway_meses: row.runway_meses === null ? null : Number(row.runway_meses),
    contratos_ativos: Number(row.contratos_ativos),
    churn_rate: Number(row.churn_rate),
  }
}

/**
 * Fecha um mês: computa métricas realizadas, gera o comentário IA comparando com o mês
 * anterior fechado, e grava (upsert por mes_ref). Idempotente.
 */
export async function fecharMes(mesRef: string, usuarioId: string): Promise<MetricasMes> {
  const admin = createServiceClient()
  const atual = await computeMetricasMes(mesRef)

  const anteriorRef = addMonthsFirstDay(mesRef, -1)
  const { data: prevRow } = await admin
    .from('metricas_mensais').select('*').eq('mes_ref', anteriorRef).maybeSingle()
  const anterior = prevRow ? rowToMetricas(prevRow as Record<string, unknown>) : null

  const commentary = await gerarCommentary(atual, anterior)

  const { error } = await admin.from('metricas_mensais').upsert(
    {
      ...atual,
      commentary_resumo: commentary.resumo,
      commentary_destaques: commentary.destaques,
      fechado_por: usuarioId,
      fechado_em: new Date().toISOString(),
    },
    { onConflict: 'mes_ref' },
  )
  if (error) throw new Error(`fecharMes: ${error.message}`)

  return atual
}
