import { createClient } from '@/lib/supabase/server'
import { NewLancamento, Lancamento } from '@/lib/schemas/lancamento'
import type { ContaAReceber } from '@/lib/schemas/ar'
import type { ContaAPagar } from '@/lib/schemas/ap'
import type { z } from 'zod'

export type ListLancamentosParams = {
  conta_id?: string
  data_de?: string
  data_ate?: string
  tipo?: 'entrada' | 'saida' | 'transferencia'
  limit?: number
}

export async function listarLancamentos(p: ListLancamentosParams = {}) {
  const supabase = await createClient()
  let q = supabase.from('lancamentos').select('*').order('data', { ascending: false })
  if (p.conta_id) q = q.eq('conta_id', p.conta_id)
  if (p.data_de) q = q.gte('data', p.data_de)
  if (p.data_ate) q = q.lte('data', p.data_ate)
  if (p.tipo) q = q.eq('tipo', p.tipo)
  if (p.limit) q = q.limit(p.limit)
  const { data, error } = await q
  if (error) throw new Error(`listarLancamentos: ${error.message}`)
  return (data ?? []) as Lancamento[]
}

export async function criarLancamento(input: z.input<typeof NewLancamento>) {
  const parsed = NewLancamento.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('lancamentos').insert(parsed).select().single()
  if (error) throw new Error(`criarLancamento: ${error.message}`)
  return data as Lancamento
}

/**
 * Build a NewLancamento from an AR. Pure function — does not write to DB.
 * Used by AR.marcarRecebido to create the cash entry atomically.
 */
export function buildLancamentoFromAR(
  ar: ContaAReceber,
  dataRecebimento: string,
  contaId: string,
  categoriaReceitaId: string | undefined,
): z.input<typeof NewLancamento> {
  return {
    data: dataRecebimento,
    valor: ar.valor,
    conta_id: contaId,
    tipo: 'entrada',
    categoria_id: categoriaReceitaId,
    descricao: `Recebimento ${ar.origem === 'contrato' ? 'AaaS' : ar.origem === 'milestone' ? 'milestone' : 'avulso'} (AR ${ar.id.slice(0, 8)})`,
    origem: 'ar',
    origem_id: ar.id,
    cliente_id: ar.cliente_id,
  }
}

/**
 * Build a NewLancamento from an AP. Pure function — does not write to DB.
 */
export function buildLancamentoFromAP(
  ap: ContaAPagar,
  dataPagamento: string,
  contaId: string,
): z.input<typeof NewLancamento> {
  return {
    data: dataPagamento,
    valor: ap.valor,
    conta_id: contaId,
    tipo: 'saida',
    categoria_id: ap.categoria_id ?? undefined,
    descricao: ap.descricao,
    origem: 'ap',
    origem_id: ap.id,
    fornecedor_id: ap.tipo_credor === 'fornecedor' ? (ap.credor_id ?? undefined) : undefined,
  }
}
