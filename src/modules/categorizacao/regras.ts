import { createClient } from '@/lib/supabase/server'
import type { Regra, NewRegra } from '@/lib/schemas/regra'
import { NewRegra as NewRegraSchema } from '@/lib/schemas/regra'
import type { z } from 'zod'

export async function listarRegras(p: { ativa?: boolean } = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('regras_categorizacao')
    .select('*, categoria:categorias(nome)')
    .order('prioridade', { ascending: false })
  if (p.ativa !== undefined) q = q.eq('ativa', p.ativa)
  const { data, error } = await q
  if (error) throw new Error(`listarRegras: ${error.message}`)
  return data ?? []
}

export async function criarRegra(input: z.input<typeof NewRegraSchema>) {
  const parsed = NewRegraSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('regras_categorizacao').insert(parsed).select().single()
  if (error) throw new Error(`criarRegra: ${error.message}`)
  return data as Regra
}

export async function atualizarRegra(id: string, input: Partial<z.input<typeof NewRegraSchema>>) {
  const parsed = NewRegraSchema.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('regras_categorizacao').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarRegra: ${error.message}`)
  return data as Regra
}

/**
 * Pure function: given a list of regras, descricao, and optional fornecedor name,
 * returns the first matching regra by prioridade descending. Null if no match.
 */
export function matchRegras(
  regras: Regra[],
  descricao: string,
  fornecedorNome: string | undefined,
): Regra | null {
  const ativas = regras.filter((r) => r.ativa)
  // Sort by prioridade desc (highest priority first)
  const sorted = [...ativas].sort((a, b) => b.prioridade - a.prioridade)
  for (const r of sorted) {
    const haystack = r.campo === 'descricao' ? descricao : (fornecedorNome ?? '')
    if (matchPattern(haystack, r.pattern, r.pattern_tipo)) return r
  }
  return null
}

function matchPattern(haystack: string, pattern: string, tipo: Regra['pattern_tipo']): boolean {
  const h = haystack.toLowerCase()
  const p = pattern.toLowerCase()
  switch (tipo) {
    case 'contains':    return h.includes(p)
    case 'starts_with': return h.startsWith(p)
    case 'exact':       return h === p
    case 'regex': {
      try { return new RegExp(pattern, 'i').test(haystack) } catch { return false }
    }
  }
}
