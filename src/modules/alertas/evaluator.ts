import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { recomputarProjecoes } from '@/modules/forecast/cenarios'
import { loadSnapshot } from '@/modules/forecast/snapshot'
import {
  avaliarRunway, avaliarAPAtrasada, avaliarARAtrasada,
  avaliarContratoVencendo, avaliarDespesaAnomala, avaliarCaixaBaixo,
} from './regras'
import { notificarAlerta } from './notificador'

const CAIXA_THRESHOLD_DEFAULT = 30000  // R$ 30k

export async function avaliarTodos(refDate: string) {
  const admin = createServiceClient()
  const stats = { evaluated: 0, notified: 0, skipped: 0 }

  // Recompute forecast first to get fresh runway
  await recomputarProjecoes()

  // Runway from Base cenario
  const { data: baseCen } = await admin.from('forecast_cenarios').select('id').eq('nome', 'Base').maybeSingle()
  let runwayMeses: number | null = null
  if (baseCen) {
    const { data: proj } = await admin
      .from('forecast_projecoes').select('runway_meses').eq('cenario_id', baseCen.id).limit(1).maybeSingle()
    runwayMeses = (proj?.runway_meses as number | null) ?? null
  }

  const runwayAlert = avaliarRunway(runwayMeses)
  if (runwayAlert) await notify(runwayAlert)

  // Caixa atual
  const snapshot = await loadSnapshot(refDate)
  const caixaAlert = avaliarCaixaBaixo(snapshot.caixaAtual, CAIXA_THRESHOLD_DEFAULT)
  if (caixaAlert) await notify(caixaAlert)

  // AP atrasadas
  const { data: aps } = await admin
    .from('contas_a_pagar')
    .select('id, descricao, valor, data_vencimento')
    .in('status', ['previsto', 'aprovado'])
    .lt('data_vencimento', refDate)
  const apAlert = avaliarAPAtrasada(((aps as Array<{ id: string; descricao: string; valor: string; data_vencimento: string }>) ?? []).map((a) => ({ ...a, valor: Number(a.valor) })))
  if (apAlert) await notify(apAlert)

  // AR atrasadas
  const { data: ars } = await admin
    .from('contas_a_receber')
    .select('id, valor, data_vencimento, cliente:clientes(nome)')
    .in('status', ['previsto', 'emitido'])
    .lt('data_vencimento', refDate)
  const arRows = ((ars as unknown as Array<{ id: string; valor: string; data_vencimento: string; cliente: { nome: string } | null }>) ?? [])
    .map((r) => ({ id: r.id, valor: Number(r.valor), data_vencimento: r.data_vencimento, cliente_nome: r.cliente?.nome ?? '' }))
  const arAlert = avaliarARAtrasada(arRows)
  if (arAlert) await notify(arAlert)

  // Contratos vencendo em 30-60d
  const in30 = new Date(new Date(refDate).getTime() + 30 * 86400_000).toISOString().slice(0, 10)
  const in60 = new Date(new Date(refDate).getTime() + 60 * 86400_000).toISOString().slice(0, 10)
  const { data: cons } = await admin
    .from('contratos')
    .select('id, nome, data_fim, cliente:clientes(nome)')
    .eq('status', 'ativo')
    .gte('data_fim', in30).lte('data_fim', in60)
  const conRows = ((cons as unknown as Array<{ id: string; nome: string; data_fim: string; cliente: { nome: string } | null }>) ?? [])
    .map((c) => ({ id: c.id, nome: c.nome, data_fim: c.data_fim, cliente_nome: c.cliente?.nome ?? '' }))
  const conAlert = avaliarContratoVencendo(conRows)
  if (conAlert) await notify(conAlert)

  // Despesa anômala: comparar lancamentos saida do dia vs média 90d por categoria
  const today = refDate
  const ninetyAgo = new Date(new Date(refDate).getTime() - 90 * 86400_000).toISOString().slice(0, 10)
  const { data: todays } = await admin
    .from('lancamentos')
    .select('id, valor, descricao, categoria_id, categoria:categorias(nome)')
    .eq('tipo', 'saida')
    .eq('data', today)
    .gt('valor', 0)

  const anomalas = []
  for (const l of (todays as unknown as Array<{ id: string; valor: string; descricao: string; categoria_id: string | null; categoria: { nome: string } | null }>) ?? []) {
    if (!l.categoria_id) continue
    const { data: media } = await admin
      .from('lancamentos')
      .select('valor')
      .eq('tipo', 'saida')
      .eq('categoria_id', l.categoria_id)
      .gte('data', ninetyAgo).lt('data', today)
    const vals = ((media as Array<{ valor: string }>) ?? []).map((v) => Number(v.valor))
    if (vals.length === 0) continue
    const m = vals.reduce((s, v) => s + v, 0) / vals.length
    anomalas.push({
      id: l.id,
      valor: Number(l.valor),
      descricao: l.descricao,
      categoria_nome: l.categoria?.nome ?? '',
      media_90d: m,
    })
  }
  const despAlert = avaliarDespesaAnomala(anomalas)
  if (despAlert) await notify(despAlert)

  async function notify(a: Parameters<typeof notificarAlerta>[0]) {
    stats.evaluated++
    const r = await notificarAlerta(a)
    if ('inserted' in r && r.inserted) stats.notified++
    else stats.skipped++
  }

  return stats
}
