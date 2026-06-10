import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { withAudit } from '@/lib/audit'
import { NewContaBancaria, AtualizarContaPatch } from '@/lib/schemas/conta-bancaria'
import type { z } from 'zod'

export type ContaBancariaRow = {
  id: string
  banco: string
  agencia: string | null
  conta: string | null
  tipo: string
  moeda: string
  saldo_atual: number
  ativa: boolean
}

type Actor = { id: string; role: string }
function requireAdmin(actor: Actor) {
  if (actor.role !== 'admin') throw new Error('apenas admin pode gerenciar contas bancárias')
}

export async function listarContasBancarias(): Promise<ContaBancariaRow[]> {
  const admin = createServiceClient()
  const { data, error } = await admin
    .from('contas_bancarias')
    .select('id, banco, agencia, conta, tipo, moeda, saldo_atual, ativa')
    .order('banco')
  if (error) throw new Error(`listarContasBancarias: ${error.message}`)
  return (data ?? []) as ContaBancariaRow[]
}

export async function criarContaBancaria(input: z.input<typeof NewContaBancaria>, actor: Actor): Promise<ContaBancariaRow> {
  requireAdmin(actor)
  const parsed = NewContaBancaria.parse(input)
  const admin = createServiceClient()
  const id = crypto.randomUUID()
  return withAudit(
    {
      usuario_id: actor.id, acao: 'insert', tabela: 'contas_bancarias', registro_id: id,
      before: null, after: parsed as Record<string, unknown>, motivo: 'criar conta bancária',
    },
    async () => {
      const { data, error } = await admin.from('contas_bancarias').insert({ id, ...parsed }).select().single()
      if (error) throw new Error(`criarContaBancaria: ${error.message}`)
      return data as ContaBancariaRow
    },
  )
}

export async function atualizarContaBancaria(id: string, patch: z.input<typeof AtualizarContaPatch>, actor: Actor): Promise<ContaBancariaRow> {
  requireAdmin(actor)
  const parsed = AtualizarContaPatch.parse(patch)
  const admin = createServiceClient()
  return withAudit(
    {
      usuario_id: actor.id, acao: 'update', tabela: 'contas_bancarias', registro_id: id,
      before: null, after: parsed as Record<string, unknown>, motivo: 'editar conta bancária',
    },
    async () => {
      const { data, error } = await admin.from('contas_bancarias').update(parsed).eq('id', id).select().single()
      if (error) throw new Error(`atualizarContaBancaria: ${error.message}`)
      return data as ContaBancariaRow
    },
  )
}
