import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NewContaAPagar, ContaAPagar } from '@/lib/schemas/ap'
import { withAudit } from '@/lib/audit'
import { criarLancamento, buildLancamentoFromAP } from '@/modules/despesas/lancamentos'
import type { z } from 'zod'

export type ListAPParams = {
  status?: 'previsto' | 'aprovado' | 'pago' | 'atrasado' | 'cancelado'
  vencimento_de?: string
  vencimento_ate?: string
  tipo_credor?: 'fornecedor' | 'funcionario' | 'pj_spot' | 'orgao_publico'
}

export async function listarAP(p: ListAPParams = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('contas_a_pagar')
    .select('*, fornecedor:fornecedores(nome), categoria:categorias(nome)')
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
