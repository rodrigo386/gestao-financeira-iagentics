import { createClient } from '@/lib/supabase/server'
import { NewCliente, Cliente } from '@/lib/schemas/cliente'
import type { z } from 'zod'

export type ListClientesParams = {
  status?: 'ativo' | 'inativo' | 'churned'
  search?: string
  limit?: number
  offset?: number
}

export async function listarClientes(p: ListClientesParams = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('clientes')
    .select('*', { count: 'exact' })
    .order('nome', { ascending: true })

  if (p.status) q = q.eq('status', p.status)
  if (p.search) q = q.or(`nome.ilike.%${p.search}%,cnpj.ilike.%${p.search}%`)
  if (p.limit) q = q.range(p.offset ?? 0, (p.offset ?? 0) + p.limit - 1)

  const { data, error, count } = await q
  if (error) throw new Error(`listarClientes: ${error.message}`)
  return { data: (data ?? []) as Cliente[], total: count ?? 0 }
}

export async function buscarCliente(id: string): Promise<Cliente | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarCliente: ${error.message}`)
  return data as Cliente | null
}

export async function criarCliente(input: z.input<typeof NewCliente>) {
  const parsed = NewCliente.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('clientes').insert(parsed).select().single()
  if (error) throw new Error(`criarCliente: ${error.message}`)
  return data as Cliente
}

export async function atualizarCliente(id: string, input: Partial<z.input<typeof NewCliente>>) {
  // Partial validation: only validate provided keys via .partial()
  const parsed = NewCliente.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('clientes').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarCliente: ${error.message}`)
  return data as Cliente
}
