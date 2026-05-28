import type { NewContaAPagar } from '@/lib/schemas/ap'
import type { DespesaRecorrente } from '@/lib/schemas/despesa_recorrente'

/**
 * Generates an AP for a recurring expense in a given month, or returns null
 * if the recorrente isn't applicable (inactive, not yet started, ended).
 */
export function gerarAPDeRecorrente(r: DespesaRecorrente, refMonthStart: string): NewContaAPagar | null {
  if (!r.ativa) return null
  if (r.data_inicio > refMonthStart) return null
  if (r.data_fim && r.data_fim < refMonthStart) return null

  const dueDate = applyDiaMes(refMonthStart, r.dia_mes)

  return {
    tipo_credor: 'fornecedor',
    credor_id: r.fornecedor_id,
    origem: 'recorrente',
    origem_id: r.id,
    descricao: r.descricao,
    valor: r.valor,
    moeda: r.moeda as 'BRL' | 'USD' | 'EUR',
    data_vencimento: dueDate,
    categoria_id: r.categoria_id,
    status: 'previsto',
  }
}

/**
 * Computes the next geracao date for a recurring expense given current month start
 * and the dia_mes. Result is in the following month.
 */
export function proximaGeracao(currentMonthStart: string, diaMes: number): string {
  const parts = currentMonthStart.split('-').map(Number)
  const y = parts[0]!
  const m = parts[1]!
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  return `${nextY}-${String(nextM).padStart(2, '0')}-${String(diaMes).padStart(2, '0')}`
}

function applyDiaMes(monthStart: string, dia: number): string {
  const parts = monthStart.split('-').map(Number)
  const y = parts[0]!
  const m = parts[1]!
  return `${y}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}
