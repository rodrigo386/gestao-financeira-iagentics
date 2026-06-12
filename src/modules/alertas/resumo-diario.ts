import { createServiceClient } from '@/lib/supabase/service'

type Bucket = { count: number; total: number }

export type ResumoDiario = {
  hoje: string
  arHoje: Bucket
  arAtrasado: Bucket
  apHoje: Bucket
  apAtrasado: Bucket
  pendencias: number
}

/**
 * "Ação de hoje": a receber / a pagar vencendo hoje + atrasados, e pendências de
 * categorização. Usa service client (contexto de cron, sem cookies).
 */
export async function montarResumoDiario(hoje: string): Promise<ResumoDiario> {
  const admin = createServiceClient()
  const AR_ABERTO = ['previsto', 'emitido', 'atrasado']
  const AP_ABERTO = ['previsto', 'aprovado', 'atrasado']

  const bucket = (data: { valor: number }[] | null, count: number | null): Bucket => ({
    count: count ?? 0,
    total: (data ?? []).reduce((s, r) => s + Number(r.valor), 0),
  })

  const [arH, arA, apH, apA, pend] = await Promise.all([
    admin.from('contas_a_receber').select('valor', { count: 'exact' }).eq('data_vencimento', hoje).in('status', AR_ABERTO),
    admin.from('contas_a_receber').select('valor', { count: 'exact' }).lt('data_vencimento', hoje).in('status', AR_ABERTO),
    admin.from('contas_a_pagar').select('valor', { count: 'exact' }).eq('data_vencimento', hoje).in('status', AP_ABERTO),
    admin.from('contas_a_pagar').select('valor', { count: 'exact' }).lt('data_vencimento', hoje).in('status', AP_ABERTO),
    admin.from('lancamentos').select('id', { count: 'exact', head: true })
      .or('categoria_id.is.null,and(categorizacao_metodo.eq.llm,categorizacao_confianca.lt.0.7)'),
  ])

  return {
    hoje,
    arHoje: bucket(arH.data as { valor: number }[] | null, arH.count),
    arAtrasado: bucket(arA.data as { valor: number }[] | null, arA.count),
    apHoje: bucket(apH.data as { valor: number }[] | null, apH.count),
    apAtrasado: bucket(apA.data as { valor: number }[] | null, apA.count),
    pendencias: pend.count ?? 0,
  }
}
