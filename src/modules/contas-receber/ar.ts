import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NewContaAReceber, ContaAReceber } from '@/lib/schemas/ar'
import { withAudit } from '@/lib/audit'
import { gerarARDoContrato } from './gerador'
import type { Contrato } from '@/lib/schemas/contrato'
import type { z } from 'zod'

export type ListARParams = {
  status?: 'previsto' | 'emitido' | 'recebido' | 'atrasado' | 'cancelado'
  cliente_id?: string
  vencimento_ate?: string
  vencimento_de?: string
}

export async function listarAR(p: ListARParams = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('contas_a_receber')
    .select('*, cliente:clientes(nome)')
    .order('data_vencimento', { ascending: true })
  if (p.status) q = q.eq('status', p.status)
  if (p.cliente_id) q = q.eq('cliente_id', p.cliente_id)
  if (p.vencimento_de) q = q.gte('data_vencimento', p.vencimento_de)
  if (p.vencimento_ate) q = q.lte('data_vencimento', p.vencimento_ate)
  const { data, error } = await q
  if (error) throw new Error(`listarAR: ${error.message}`)
  return data ?? []
}

export async function criarAR(input: z.input<typeof NewContaAReceber>) {
  const parsed = NewContaAReceber.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('contas_a_receber').insert(parsed).select().single()
  if (error) throw new Error(`criarAR: ${error.message}`)
  return data as ContaAReceber
}

/**
 * Mark an AR as received. Atomically creates a lancamento entrada and links it via lancamento_id.
 */
export async function marcarRecebido(
  id: string,
  dataRecebimento: string,
  contaId: string,
  categoriaReceitaId: string | undefined,
  usuarioId: string,
) {
  const supabase = await createClient()
  const { data: before, error: bErr } = await supabase
    .from('contas_a_receber').select('*').eq('id', id).single()
  if (bErr || !before) throw new Error(`AR not found`)

  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'update',
      tabela: 'contas_a_receber',
      registro_id: id,
      before: before as Record<string, unknown>,
      after: { ...(before as Record<string, unknown>), status: 'recebido', data_recebimento: dataRecebimento },
      motivo: 'marcar como recebido',
    },
    async () => {
      // Atomically: create lancamento → update AR with lancamento_id
      const { buildLancamentoFromAR, criarLancamento } = await import('@/modules/despesas/lancamentos')
      const lancamentoInput = buildLancamentoFromAR(
        before as never,
        dataRecebimento,
        contaId,
        categoriaReceitaId,
      )
      const lancamento = await criarLancamento(lancamentoInput)

      const { data, error } = await supabase
        .from('contas_a_receber')
        .update({
          status: 'recebido',
          data_recebimento: dataRecebimento,
          lancamento_id: lancamento.id,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(`marcarRecebido: ${error.message}`)
      return data
    },
  )
}

export async function cancelarAR(id: string, motivo: string, usuarioId: string) {
  const supabase = await createClient()
  const { data: before, error: bErr } = await supabase
    .from('contas_a_receber').select('*').eq('id', id).single()
  if (bErr || !before) throw new Error(`AR not found`)

  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'update',
      tabela: 'contas_a_receber',
      registro_id: id,
      before: before as Record<string, unknown>,
      after: { ...(before as Record<string, unknown>), status: 'cancelado' },
      motivo,
    },
    async () => {
      const { data, error } = await supabase
        .from('contas_a_receber').update({ status: 'cancelado' }).eq('id', id).select().single()
      if (error) throw new Error(`cancelarAR: ${error.message}`)
      return data as ContaAReceber
    },
  )
}

/**
 * Generates AR (status 'previsto') for the given reference month for ALL active
 * contracts, skipping any that already exist (dedup via the unique index).
 * Shared by the monthly cron and the on-demand "Gerar AR do mês" button.
 *
 * `refMonth` is the first day of the month, "YYYY-MM-01". Contracts whose
 * `data_inicio` is after `refMonth` (future) or that ended before it produce no AR.
 */
export async function gerarARMes(refMonth: string) {
  const admin = createServiceClient()
  const { data: contratos, error } = await admin
    .from('contratos')
    .select('*')
    .eq('status', 'ativo')
  if (error) throw new Error(`gerarARMes: ${error.message}`)

  const novos = (contratos as Contrato[])
    .map((c) => gerarARDoContrato(c, refMonth))
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const result = await inserirARBatch(novos)
  return { refMonth, contratos_ativos: contratos?.length ?? 0, ...result }
}

/**
 * Service-role helper for the AR generation job. Inserts a batch of NewAR,
 * skipping duplicates (relies on the unique indexes from migration 0010).
 */
export async function inserirARBatch(rows: z.input<typeof NewContaAReceber>[]) {
  if (rows.length === 0) return { inserted: 0, skipped: 0 }
  const parsed = rows.map((r) => NewContaAReceber.parse(r))
  const admin = createServiceClient()
  let inserted = 0
  let skipped = 0
  for (const row of parsed) {
    const { error } = await admin.from('contas_a_receber').insert(row)
    if (error) {
      if (error.code === '23505') {
        skipped++
        continue
      }
      throw new Error(`inserirARBatch: ${error.message}`)
    }
    inserted++
  }
  return { inserted, skipped }
}
