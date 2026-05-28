import { createClient } from '@/lib/supabase/server'
import { NewProjeto, NewMilestone, Projeto, Milestone } from '@/lib/schemas/projeto'
import type { z } from 'zod'

export async function listarProjetos(params: { cliente_id?: string; status?: string } = {}) {
  const supabase = await createClient()
  let q = supabase.from('projetos').select('*').order('criado_em', { ascending: false })
  if (params.cliente_id) q = q.eq('cliente_id', params.cliente_id)
  if (params.status) q = q.eq('status', params.status)
  const { data, error } = await q
  if (error) throw new Error(`listarProjetos: ${error.message}`)
  return (data ?? []) as Projeto[]
}

export async function buscarProjeto(id: string): Promise<Projeto | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('projetos').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarProjeto: ${error.message}`)
  return data as Projeto | null
}

export async function criarProjeto(input: z.input<typeof NewProjeto>) {
  const parsed = NewProjeto.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('projetos').insert(parsed).select().single()
  if (error) throw new Error(`criarProjeto: ${error.message}`)
  return data as Projeto
}

export async function atualizarProjeto(id: string, input: Partial<z.input<typeof NewProjeto>>) {
  const parsed = NewProjeto.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('projetos').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarProjeto: ${error.message}`)
  return data as Projeto
}

export async function listarMilestones(projeto_id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('projeto_id', projeto_id)
    .order('ordem', { ascending: true })
  if (error) throw new Error(`listarMilestones: ${error.message}`)
  return (data ?? []) as Milestone[]
}

export async function criarMilestone(input: z.input<typeof NewMilestone>) {
  const parsed = NewMilestone.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('milestones').insert(parsed).select().single()
  if (error) throw new Error(`criarMilestone: ${error.message}`)
  return data as Milestone
}

export async function atualizarMilestone(id: string, input: Partial<z.input<typeof NewMilestone>>) {
  const parsed = NewMilestone.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('milestones').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarMilestone: ${error.message}`)
  return data as Milestone
}
