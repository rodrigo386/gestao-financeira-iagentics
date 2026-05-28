import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { classificarBreak, type Candidato, type LancamentoBank } from './conciliacao'

export async function conciliarPendentes(): Promise<{
  processados: number
  matched: number
  sugestoes: number
}> {
  const admin = createServiceClient()
  let processados = 0, matched = 0, sugestoes = 0

  // Fetch Pluggy lancamentos awaiting conciliation
  const { data: lancs } = await admin
    .from('lancamentos')
    .select('id, data, valor, descricao, tipo')
    .eq('origem', 'pluggy')
    .eq('conciliado', false)
    .limit(100)

  for (const l of lancs ?? []) {
    processados++
    const lanc: LancamentoBank = {
      id: l.id, data: l.data, valor: Number(l.valor), descricao: l.descricao, tipo: l.tipo,
    }

    // Find candidatos within ±3 days window with value within 5% range
    const dayWindow = 3
    const from = addDays(l.data, -dayWindow)
    const to = addDays(l.data, dayWindow)

    const table = lanc.tipo === 'entrada' ? 'contas_a_receber' : 'contas_a_pagar'
    const statuses = lanc.tipo === 'entrada'
      ? ['previsto', 'emitido', 'atrasado']
      : ['previsto', 'aprovado', 'atrasado']
    const minVal = lanc.valor * 0.95, maxVal = lanc.valor * 1.05

    const { data: cands } = await admin
      .from(table)
      .select('id, valor, data_vencimento, descricao:observacoes')   // observacoes as descricao approx
      .gte('data_vencimento', from).lte('data_vencimento', to)
      .gte('valor', minVal).lte('valor', maxVal)
      .in('status', statuses)
      .limit(20)

    const candidatos: Candidato[] = (cands ?? []).map((c) => ({
      id: c.id,
      valor: Number(c.valor),
      data_vencimento: c.data_vencimento,
      descricao: (c.descricao as string | null) ?? '',
      tipo: lanc.tipo === 'entrada' ? 'ar' : 'ap',
    }))

    const classification = classificarBreak(lanc, candidatos)

    if (classification.classificacao === 'matched' && classification.melhor_match_id) {
      // Auto-link: update AP/AR with lancamento_id + status → received/paid
      const updateTable = lanc.tipo === 'entrada' ? 'contas_a_receber' : 'contas_a_pagar'
      const newStatus = lanc.tipo === 'entrada' ? 'recebido' : 'pago'
      const dateField = lanc.tipo === 'entrada' ? 'data_recebimento' : 'data_pagamento'

      await admin.from(updateTable).update({
        status: newStatus,
        [dateField]: lanc.data,
        lancamento_id: lanc.id,
      }).eq('id', classification.melhor_match_id)
      await admin.from('lancamentos').update({ conciliado: true }).eq('id', lanc.id)
      matched++
    } else {
      // Queue as sugestao
      await admin.from('sugestoes_conciliacao').insert({
        lancamento_id: lanc.id,
        candidato_tipo: lanc.tipo === 'entrada' ? 'ar' : 'ap',
        candidato_id: classification.melhor_match_id,
        break_tipo: classification.classificacao,
        score: classification.score,
        explicacao: classification.explicacao,
      })
      sugestoes++
    }
  }

  return { processados, matched, sugestoes }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
