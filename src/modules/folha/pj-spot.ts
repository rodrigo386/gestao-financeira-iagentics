import { createClient } from '@/lib/supabase/server'
import { withAudit } from '@/lib/audit'
import { NewPJSpot, PJSpot, NewAlocacao, Alocacao } from '@/lib/schemas/pj-spot'
import type { z } from 'zod'

// ─── PJ Spot CRUD ──────────────────────────────────────────────────────────

export type ListPJSpotParams = {
  ativo?: boolean
  especialidade?: string
  search?: string
  limit?: number
  offset?: number
}

export async function listarPJSpot(p: ListPJSpotParams = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('pj_spot')
    .select('*', { count: 'exact' })
    .order('nome', { ascending: true })

  if (p.ativo !== undefined) q = q.eq('ativo', p.ativo)
  if (p.especialidade) q = q.eq('especialidade', p.especialidade)
  if (p.search) q = q.ilike('nome', `%${p.search}%`)
  if (p.limit) q = q.range(p.offset ?? 0, (p.offset ?? 0) + p.limit - 1)

  const { data, error, count } = await q
  if (error) throw new Error(`listarPJSpot: ${error.message}`)
  return { data: (data ?? []) as PJSpot[], total: count ?? 0 }
}

export async function buscarPJSpot(id: string): Promise<PJSpot | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pj_spot')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`buscarPJSpot: ${error.message}`)
  return data as PJSpot | null
}

export async function criarPJSpot(input: z.input<typeof NewPJSpot>) {
  const parsed = NewPJSpot.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pj_spot')
    .insert(parsed)
    .select()
    .single()
  if (error) throw new Error(`criarPJSpot: ${error.message}`)
  return data as PJSpot
}

export async function atualizarPJSpot(id: string, input: Partial<z.input<typeof NewPJSpot>>) {
  const parsed = NewPJSpot.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pj_spot')
    .update(parsed)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`atualizarPJSpot: ${error.message}`)
  return data as PJSpot
}

// ─── Alocação CRUD ─────────────────────────────────────────────────────────

export type ListAlocacoesParams = {
  pj_id?: string
  projeto_id?: string
  status?: 'contratado' | 'em_andamento' | 'concluido' | 'pago'
  limit?: number
  offset?: number
}

export async function listarAlocacoes(p: ListAlocacoesParams = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('alocacoes_pj')
    .select('*', { count: 'exact' })
    .order('data_inicio', { ascending: false })

  if (p.pj_id) q = q.eq('pj_id', p.pj_id)
  if (p.projeto_id) q = q.eq('projeto_id', p.projeto_id)
  if (p.status) q = q.eq('status', p.status)
  if (p.limit) q = q.range(p.offset ?? 0, (p.offset ?? 0) + p.limit - 1)

  const { data, error, count } = await q
  if (error) throw new Error(`listarAlocacoes: ${error.message}`)
  return { data: (data ?? []) as Alocacao[], total: count ?? 0 }
}

export async function buscarAlocacao(id: string): Promise<Alocacao | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('alocacoes_pj')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`buscarAlocacao: ${error.message}`)
  return data as Alocacao | null
}

export async function criarAlocacao(input: z.input<typeof NewAlocacao>) {
  const parsed = NewAlocacao.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('alocacoes_pj')
    .insert(parsed)
    .select()
    .single()
  if (error) throw new Error(`criarAlocacao: ${error.message}`)
  return data as Alocacao
}

export async function atualizarAlocacao(
  id: string,
  input: Partial<z.input<typeof NewAlocacao>>,
) {
  const parsed = NewAlocacao.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('alocacoes_pj')
    .update(parsed)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`atualizarAlocacao: ${error.message}`)
  return data as Alocacao
}

/**
 * Concludes a PJ Spot allocation:
 *   1. Creates an avulso AP for the alocação's valor_total (or a provided override)
 *   2. Links the AP back to the alocação via ap_id
 *   3. Sets status = 'concluido' and records data_prevista_fim if dataReal provided
 * Wrapped in withAudit.
 */
export async function concluirAlocacao(
  id: string,
  dataReal: string,
  usuarioId: string,
  valorFinal?: number,
): Promise<Alocacao> {
  const { criarAP } = await import('@/modules/contas-pagar/ap')
  const supabase = await createClient()

  const { data: alocacao, error: aErr } = await supabase
    .from('alocacoes_pj')
    .select('*')
    .eq('id', id)
    .single()
  if (aErr || !alocacao) throw new Error(`concluirAlocacao: alocação not found`)

  const valor = valorFinal ?? (alocacao.valor_total as number)

  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'update',
      tabela: 'alocacoes_pj',
      registro_id: id,
      before: alocacao as Record<string, unknown>,
      after: {
        ...(alocacao as Record<string, unknown>),
        status: 'concluido',
        data_prevista_fim: dataReal,
      },
      motivo: 'concluir alocacao',
    },
    async () => {
      // Create avulso AP for the PJ contractor payment
      const ap = await criarAP({
        tipo_credor: 'pj_spot',
        credor_id: alocacao.pj_id as string,
        origem: 'alocacao_pj',
        origem_id: id,
        descricao: alocacao.descricao as string,
        valor,
        moeda: 'BRL',
        data_vencimento: dataReal,
        status: 'previsto',
      })

      // Update alocação: status=concluido + link ap_id
      const { data, error } = await supabase
        .from('alocacoes_pj')
        .update({
          status: 'concluido',
          data_prevista_fim: dataReal,
          ap_id: ap.id,
          horas_realizadas: alocacao.horas_realizadas,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(`concluirAlocacao: ${error.message}`)
      return data as Alocacao
    },
  )
}
