import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NewContaAPagar, ContaAPagar } from '@/lib/schemas/ap'
import { withAudit } from '@/lib/audit'
import { criarLancamento, buildLancamentoFromAP } from '@/modules/despesas/lancamentos'
import type { z } from 'zod'
import { gerarAPDeRecorrente, proximaGeracao } from './gerador'
import type { DespesaRecorrente } from '@/lib/schemas/despesa_recorrente'

export type ListAPParams = {
  status?: 'previsto' | 'aprovado' | 'pago' | 'atrasado' | 'cancelado'
  vencimento_de?: string
  vencimento_ate?: string
  tipo_credor?: 'fornecedor' | 'funcionario' | 'pj_spot' | 'orgao_publico'
}

// PostgREST projection for AP rows. contas_a_pagar.categoria_id has a real FK to
// categorias, so that embed is valid. The creditor is polymorphic (tipo_credor +
// credor_id, with NO foreign key), so fornecedores CANNOT be embedded here.
export const AP_SELECT = '*, categoria:categorias(nome)'

export async function listarAP(p: ListAPParams = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('contas_a_pagar')
    .select(AP_SELECT)
    .order('data_vencimento', { ascending: true })
  if (p.status) q = q.eq('status', p.status)
  if (p.vencimento_de) q = q.gte('data_vencimento', p.vencimento_de)
  if (p.vencimento_ate) q = q.lte('data_vencimento', p.vencimento_ate)
  if (p.tipo_credor) q = q.eq('tipo_credor', p.tipo_credor)
  const { data, error } = await q
  if (error) throw new Error(`listarAP: ${error.message}`)
  return data ?? []
}

export async function buscarAP(id: string): Promise<ContaAPagar | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('contas_a_pagar').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarAP: ${error.message}`)
  return data as ContaAPagar | null
}

export async function criarAP(input: z.input<typeof NewContaAPagar>) {
  const parsed = NewContaAPagar.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('contas_a_pagar').insert(parsed).select().single()
  if (error) throw new Error(`criarAP: ${error.message}`)
  return data as ContaAPagar
}

export async function aprovarAP(id: string, usuarioId: string) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('contas_a_pagar').select('*').eq('id', id).single()
  if (!before) throw new Error('AP not found')

  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'update',
      tabela: 'contas_a_pagar',
      registro_id: id,
      before: before as Record<string, unknown>,
      after: { ...(before as Record<string, unknown>), status: 'aprovado', aprovador_id: usuarioId },
      motivo: 'aprovar AP',
    },
    async () => {
      const { data, error } = await supabase
        .from('contas_a_pagar')
        .update({ status: 'aprovado', aprovador_id: usuarioId, aprovado_em: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) throw new Error(`aprovarAP: ${error.message}`)
      return data as ContaAPagar
    },
  )
}

/**
 * Mark an AP as paid. Atomically: creates lancamento (saida) + updates AP with lancamento_id + status.
 * Uses service-role client because we need to bypass RLS only when chaining operations within a single user action.
 */
export async function marcarAPPago(id: string, dataPagamento: string, contaId: string, usuarioId: string) {
  const userSupabase = await createClient()
  const { data: before, error: bErr } = await userSupabase
    .from('contas_a_pagar').select('*').eq('id', id).single()
  if (bErr || !before) throw new Error('AP not found')

  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'update',
      tabela: 'contas_a_pagar',
      registro_id: id,
      before: before as Record<string, unknown>,
      after: { ...(before as Record<string, unknown>), status: 'pago', data_pagamento: dataPagamento },
      motivo: 'marcar pago',
    },
    async () => {
      // Create lancamento first
      const lancamentoInput = buildLancamentoFromAP(before as ContaAPagar, dataPagamento, contaId)
      const lancamento = await criarLancamento(lancamentoInput)

      // Update AP
      const { data, error } = await userSupabase
        .from('contas_a_pagar')
        .update({ status: 'pago', data_pagamento: dataPagamento, lancamento_id: lancamento.id })
        .eq('id', id).select().single()
      if (error) throw new Error(`marcarAPPago: ${error.message}`)
      return data as ContaAPagar
    },
  )
}

export async function cancelarAP(id: string, motivo: string, usuarioId: string) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('contas_a_pagar').select('*').eq('id', id).single()
  if (!before) throw new Error('AP not found')

  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'update',
      tabela: 'contas_a_pagar',
      registro_id: id,
      before: before as Record<string, unknown>,
      after: { ...(before as Record<string, unknown>), status: 'cancelado' },
      motivo,
    },
    async () => {
      const { data, error } = await supabase
        .from('contas_a_pagar').update({ status: 'cancelado' }).eq('id', id).select().single()
      if (error) throw new Error(`cancelarAP: ${error.message}`)
      return data as ContaAPagar
    },
  )
}

export async function inserirAPBatch(rows: z.input<typeof NewContaAPagar>[]) {
  if (rows.length === 0) return { inserted: 0, skipped: 0 }
  const parsed = rows.map((r) => NewContaAPagar.parse(r))
  const admin = createServiceClient()
  let inserted = 0
  let skipped = 0
  for (const row of parsed) {
    const { error } = await admin.from('contas_a_pagar').insert(row)
    if (error) {
      if (error.code === '23505') { skipped++; continue }
      throw new Error(`inserirAPBatch: ${error.message}`)
    }
    inserted++
  }
  return { inserted, skipped }
}

/**
 * Gera AP (status 'previsto') do mês de referência para TODAS as despesas
 * recorrentes ativas, pulando as que já existem (dedup via índice único).
 * Atualiza `proxima_geracao` das que geraram. Compartilhado pelo cron mensal
 * e pelo botão "Gerar AP" do Fechamento. `refMonth` = "YYYY-MM-01".
 */
export async function gerarAPMes(refMonth: string) {
  const admin = createServiceClient()
  const { data: recorrentes, error } = await admin
    .from('despesas_recorrentes')
    .select('*')
    .eq('ativa', true)
  if (error) throw new Error(`gerarAPMes: ${error.message}`)

  const recs = recorrentes as DespesaRecorrente[]
  const novos = recs
    .map((r) => gerarAPDeRecorrente(r, refMonth))
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const result = await inserirAPBatch(novos)

  // Atualiza proxima_geracao das recorrentes que geraram AP neste mês
  for (const r of recs) {
    if (gerarAPDeRecorrente(r, refMonth) !== null) {
      const next = proximaGeracao(refMonth, r.dia_mes)
      await admin.from('despesas_recorrentes').update({ proxima_geracao: next }).eq('id', r.id)
    }
  }

  return { refMonth, recorrentes_ativas: recs.length, ...result }
}
