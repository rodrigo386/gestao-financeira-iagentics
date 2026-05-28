import { createClient } from '@/lib/supabase/server'
import { withAudit } from '@/lib/audit'
import { NewFuncionario, Funcionario } from '@/lib/schemas/funcionario'
import type { z } from 'zod'

export type ListFuncionariosParams = {
  ativo?: boolean
  tipo?: 'clt' | 'pj_recorrente'
  search?: string
  limit?: number
  offset?: number
}

export async function listarFuncionarios(p: ListFuncionariosParams = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('funcionarios')
    .select('*', { count: 'exact' })
    .order('nome', { ascending: true })

  if (p.ativo !== undefined) q = q.eq('ativo', p.ativo)
  if (p.tipo) q = q.eq('tipo', p.tipo)
  if (p.search) q = q.ilike('nome', `%${p.search}%`)
  if (p.limit) q = q.range(p.offset ?? 0, (p.offset ?? 0) + p.limit - 1)

  const { data, error, count } = await q
  if (error) throw new Error(`listarFuncionarios: ${error.message}`)
  return { data: (data ?? []) as Funcionario[], total: count ?? 0 }
}

export async function buscarFuncionario(id: string): Promise<Funcionario | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('funcionarios')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`buscarFuncionario: ${error.message}`)
  return data as Funcionario | null
}

export async function criarFuncionario(input: z.input<typeof NewFuncionario>) {
  const parsed = NewFuncionario.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('funcionarios')
    .insert(parsed)
    .select()
    .single()
  if (error) throw new Error(`criarFuncionario: ${error.message}`)
  return data as Funcionario
}

export async function atualizarFuncionario(
  id: string,
  input: Partial<z.input<typeof NewFuncionario>>,
) {
  const parsed = NewFuncionario.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('funcionarios')
    .update(parsed)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`atualizarFuncionario: ${error.message}`)
  return data as Funcionario
}

/**
 * Desliga um funcionário: sets data_desligamento + ativo=false.
 * Wrapped in withAudit for sensitive mutation tracking.
 */
export async function desligarFuncionario(
  id: string,
  dataDesligamento: string,
  motivo: string,
  usuarioId: string,
): Promise<Funcionario> {
  const supabase = await createClient()
  const { data: before, error: bErr } = await supabase
    .from('funcionarios')
    .select('*')
    .eq('id', id)
    .single()
  if (bErr || !before) throw new Error(`desligarFuncionario: funcionario not found`)

  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'update',
      tabela: 'funcionarios',
      registro_id: id,
      before: before as Record<string, unknown>,
      after: {
        ...(before as Record<string, unknown>),
        data_desligamento: dataDesligamento,
        ativo: false,
      },
      motivo,
    },
    async () => {
      const { data, error } = await supabase
        .from('funcionarios')
        .update({ data_desligamento: dataDesligamento, ativo: false })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(`desligarFuncionario: ${error.message}`)
      return data as Funcionario
    },
  )
}
