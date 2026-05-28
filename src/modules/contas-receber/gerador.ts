import type { NewContaAReceber } from '@/lib/schemas/ar'
import type { Contrato } from '@/lib/schemas/contrato'
import type { Milestone } from '@/lib/schemas/projeto'

/**
 * Generates AR for a contract in a given month, or returns null if the contract
 * shouldn't produce an AR for that month (paused/churned, not yet started, ended).
 *
 * The reference date is the first of the month being billed. Emission is the 1st;
 * due date is dia_cobranca of the same month.
 */
export function gerarARDoContrato(c: Contrato, refMonthStart: string): NewContaAReceber | null {
  if (c.status !== 'ativo') return null
  if (c.data_inicio > refMonthStart) return null
  // Determine the last day of the month
  const monthEnd = lastDayOfMonth(refMonthStart)
  if (c.data_fim && c.data_fim < refMonthStart) return null

  const valor = c.tipo === 'anual' ? c.ticket / 12 : c.ticket
  const dueDate = applyDiaCobranca(refMonthStart, c.dia_cobranca)

  return {
    cliente_id: c.cliente_id,
    origem: 'contrato',
    origem_id: c.id,
    valor,
    moeda: c.moeda,
    data_emissao: refMonthStart,
    data_vencimento: dueDate,
    status: 'previsto',
  }
}

/**
 * Generates AR for a milestone whose status is 'concluido'.
 * Uses data_real if set; otherwise data_prevista.
 */
export function gerarARDoMilestone(
  m: Milestone,
  _projetoId: string,
  clienteId: string,
): NewContaAReceber | null {
  if (m.status !== 'concluido') return null

  const emissao = m.data_real ?? m.data_prevista
  const vencimento = addDays(emissao, 15)  // default Net-15 for milestones

  return {
    cliente_id: clienteId,
    origem: 'milestone',
    origem_id: m.id,
    valor: m.valor,
    moeda: 'BRL',
    data_emissao: emissao,
    data_vencimento: vencimento,
    status: 'previsto',
  }
}

function applyDiaCobranca(monthStart: string, dia: number): string {
  const [y, m] = monthStart.split('-').map(Number)
  return `${y}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function lastDayOfMonth(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}
