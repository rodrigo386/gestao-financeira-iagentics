import { createClient } from '@/lib/supabase/server'
import { NewContrato, Contrato } from '@/lib/schemas/contrato'
import type { z } from 'zod'

export async function listarContratos(params: { cliente_id?: string; status?: 'ativo'|'pausado'|'churned' } = {}) {
  const supabase = await createClient()
  let q = supabase.from('contratos').select('*').order('criado_em', { ascending: false })
  if (params.cliente_id) q = q.eq('cliente_id', params.cliente_id)
  if (params.status) q = q.eq('status', params.status)
  const { data, error } = await q
  if (error) throw new Error(`listarContratos: ${error.message}`)
  return (data ?? []) as Contrato[]
}

export async function buscarContrato(id: string): Promise<Contrato | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('contratos').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarContrato: ${error.message}`)
  return data as Contrato | null
}

export async function criarContrato(input: z.input<typeof NewContrato>) {
  const parsed = NewContrato.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('contratos').insert(parsed).select().single()
  if (error) throw new Error(`criarContrato: ${error.message}`)
  return data as Contrato
}

export async function atualizarContrato(id: string, input: Partial<z.input<typeof NewContrato>>) {
  const parsed = NewContrato.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('contratos').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarContrato: ${error.message}`)
  return data as Contrato
}

export async function marcarChurn(id: string, motivo: string, data: string) {
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('contratos')
    .update({ status: 'churned', motivo_churn: motivo, data_churn: data, data_fim: data })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`marcarChurn: ${error.message}`)
  return row as Contrato
}
