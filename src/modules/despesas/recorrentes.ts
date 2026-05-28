import { createClient } from '@/lib/supabase/server'
import { NewDespesaRecorrente, DespesaRecorrente } from '@/lib/schemas/despesa_recorrente'
import type { z } from 'zod'

export async function listarRecorrentes(params: { ativa?: boolean; fornecedor_id?: string } = {}) {
  const supabase = await createClient()
  let q = supabase.from('despesas_recorrentes')
    .select('*, fornecedor:fornecedores(nome), categoria:categorias(nome)')
    .order('descricao', { ascending: true })
  if (params.ativa !== undefined) q = q.eq('ativa', params.ativa)
  if (params.fornecedor_id) q = q.eq('fornecedor_id', params.fornecedor_id)
  const { data, error } = await q
  if (error) throw new Error(`listarRecorrentes: ${error.message}`)
  return data ?? []
}

export async function buscarRecorrente(id: string): Promise<DespesaRecorrente | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('despesas_recorrentes').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarRecorrente: ${error.message}`)
  return data as DespesaRecorrente | null
}

export async function criarRecorrente(input: z.input<typeof NewDespesaRecorrente>) {
  const parsed = NewDespesaRecorrente.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('despesas_recorrentes').insert(parsed).select().single()
  if (error) throw new Error(`criarRecorrente: ${error.message}`)
  return data as DespesaRecorrente
}

export async function atualizarRecorrente(id: string, input: Partial<z.input<typeof NewDespesaRecorrente>>) {
  const parsed = NewDespesaRecorrente.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('despesas_recorrentes').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarRecorrente: ${error.message}`)
  return data as DespesaRecorrente
}
