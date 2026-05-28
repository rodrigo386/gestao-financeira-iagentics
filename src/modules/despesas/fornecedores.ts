import { createClient } from '@/lib/supabase/server'
import { NewFornecedor, Fornecedor } from '@/lib/schemas/fornecedor'
import type { z } from 'zod'

export async function listarFornecedores(params: { search?: string; ativo?: boolean } = {}) {
  const supabase = await createClient()
  let q = supabase.from('fornecedores').select('*').order('nome', { ascending: true })
  if (params.ativo !== undefined) q = q.eq('ativo', params.ativo)
  if (params.search) q = q.or(`nome.ilike.%${params.search}%,cnpj.ilike.%${params.search}%`)
  const { data, error } = await q
  if (error) throw new Error(`listarFornecedores: ${error.message}`)
  return (data ?? []) as Fornecedor[]
}

export async function buscarFornecedor(id: string): Promise<Fornecedor | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('fornecedores').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarFornecedor: ${error.message}`)
  return data as Fornecedor | null
}

export async function criarFornecedor(input: z.input<typeof NewFornecedor>) {
  const parsed = NewFornecedor.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('fornecedores').insert(parsed).select().single()
  if (error) throw new Error(`criarFornecedor: ${error.message}`)
  return data as Fornecedor
}

export async function atualizarFornecedor(id: string, input: Partial<z.input<typeof NewFornecedor>>) {
  const parsed = NewFornecedor.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('fornecedores').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarFornecedor: ${error.message}`)
  return data as Fornecedor
}
