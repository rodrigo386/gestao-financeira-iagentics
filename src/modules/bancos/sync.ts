import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { listTransactions, getItem } from './pluggy-client'
import { categorizar } from '@/modules/categorizacao/cascata'
import type { Regra } from '@/lib/schemas/regra'

export type SyncResult = {
  pluggy_item_id: string
  inserted: number
  skipped: number
  categorizados: number
  pendentes: number
  errors: string[]
}

export async function syncPluggyItem(pluggyItemId: string): Promise<SyncResult> {
  const admin = createServiceClient()
  const result: SyncResult = { pluggy_item_id: pluggyItemId, inserted: 0, skipped: 0, categorizados: 0, pendentes: 0, errors: [] }

  // 1. Find linked conta_bancaria
  const { data: pluggyItem } = await admin
    .from('pluggy_items').select('id, conta_bancaria_id').eq('pluggy_item_id', pluggyItemId).maybeSingle()
  if (!pluggyItem) {
    result.errors.push('pluggy_item not found in DB')
    return result
  }
  const contaBancariaId = pluggyItem.conta_bancaria_id
  if (!contaBancariaId) {
    result.errors.push('pluggy_item not linked to a conta_bancaria')
    return result
  }

  // 2. Sync window: last 30 days (idempotent — dedup via pluggy_transaction_id)
  const today = new Date()
  const from = new Date(today.getTime() - 30 * 86400_000).toISOString().slice(0, 10)
  const to = today.toISOString().slice(0, 10)

  // 3. Fetch transactions
  let transactions
  try {
    transactions = await listTransactions({ pluggyItemId, from, to })
  } catch (e) {
    result.errors.push(`Pluggy fetch failed: ${(e as Error).message}`)
    return result
  }

  // 4. Load supporting data for categorization
  const { data: regrasRows } = await admin.from('regras_categorizacao').select('*').eq('ativa', true)
  const { data: categoriasRows } = await admin.from('categorias').select('id, nome').eq('ativa', true)
  const { data: historicoRows } = await admin
    .from('lancamentos')
    .select('descricao, categoria_id, fornecedor_id')
    .not('categoria_id', 'is', null)
    .gte('data', new Date(today.getTime() - 180 * 86400_000).toISOString().slice(0, 10))
    .limit(500)

  const regras = (regrasRows ?? []) as Regra[]
  const categorias = (categoriasRows ?? []).map((c) => ({ id: c.id, nome: c.nome }))
  const historico = (historicoRows ?? []).map((h) => ({
    descricao: h.descricao,
    categoria_id: h.categoria_id as string,
    fornecedor_id: h.fornecedor_id as string | null,
  }))

  // 5. Insert each transaction (idempotent on pluggy_transaction_id)
  for (const tx of transactions) {
    // Check dedup
    const { data: existing } = await admin
      .from('lancamentos').select('id').eq('pluggy_transaction_id', tx.id).maybeSingle()
    if (existing) {
      result.skipped++
      continue
    }

    // Categorize
    const cat = await categorizar({
      descricao: tx.description,
      valor: Math.abs(tx.amount),
      regras,
      historico,
      categorias,
    })

    const tipo: 'entrada' | 'saida' = tx.amount > 0 ? 'entrada' : 'saida'

    const insertObj = {
      data: tx.date,
      valor: Math.abs(tx.amount),
      conta_id: contaBancariaId,
      tipo,
      categoria_id: cat.pendente ? null : cat.categoria_id,
      descricao: tx.description,
      origem: 'pluggy' as const,
      conciliado: false,
      pluggy_transaction_id: tx.id,
      categorizacao_metodo: cat.metodo,
      categorizacao_confianca: cat.confianca,
    }

    const { error: insErr } = await admin.from('lancamentos').insert(insertObj)
    if (insErr) {
      result.errors.push(`insert ${tx.id}: ${insErr.message}`)
      continue
    }

    result.inserted++
    if (cat.pendente) result.pendentes++
    else result.categorizados++
  }

  // 6. Update sync status
  try {
    const itemStatus = await getItem(pluggyItemId)
    await admin.from('pluggy_items')
      .update({ status: itemStatus.status, last_synced_at: new Date().toISOString() })
      .eq('id', pluggyItem.id)
  } catch (e) {
    result.errors.push(`status update: ${(e as Error).message}`)
  }

  return result
}
