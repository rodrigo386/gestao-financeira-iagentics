import type { Contrato } from '@/lib/schemas/contrato'

/**
 * Returns the monthly recurring revenue at a given reference date.
 * Annual contracts contribute ticket/12. Only 'ativo' contracts that span
 * the reference date are included.
 */
export function calcularMRR(contratos: Contrato[], refDate: string): number {
  return contratos
    .filter((c) => isAtivoNaData(c, refDate))
    .reduce((sum, c) => sum + ticketMensal(c), 0)
}

export function calcularARR(contratos: Contrato[], refDate: string): number {
  return calcularMRR(contratos, refDate) * 12
}

/**
 * Churn rate over a month = (MRR of contracts that churned in [refDate, refDate+1mo]) / (MRR at refDate)
 * MRR at start of month includes contracts that were active at refDate, even if they churned later in the month.
 */
export function calcularChurnRate(contratos: Contrato[], refDate: string): number {
  const fimMes = addMonths(refDate, 1)

  // Contracts that were active at start of month: either still ativo, or churned AFTER refDate
  const ativosNoInicio = contratos.filter(
    (c) =>
      (c.status === 'ativo' && c.data_inicio <= refDate && (!c.data_fim || c.data_fim >= refDate)) ||
      (c.status === 'churned' && c.data_churn && c.data_churn >= refDate && c.data_inicio <= refDate),
  )
  const mrrInicio = ativosNoInicio.reduce((sum, c) => sum + ticketMensal(c), 0)
  if (mrrInicio === 0) return 0

  const mrrChurned = contratos
    .filter((c) => c.status === 'churned' && c.data_churn && c.data_churn >= refDate && c.data_churn < fimMes)
    .reduce((sum, c) => sum + ticketMensal(c), 0)

  return mrrChurned / mrrInicio
}

/**
 * Net Revenue Retention: comparing existing customers (by cliente_id or contract id present at start).
 * NRR = MRR(end) of existing customers / MRR(start). New customers excluded.
 */
export function calcularNRR(start: Contrato[], end: Contrato[]): number {
  const startClienteIds = new Set(start.map((c) => c.cliente_id))
  const startIds = new Set(start.map((c) => c.id))
  const mrrStart = start.reduce((sum, c) => sum + ticketMensal(c), 0)
  if (mrrStart === 0) return 1.0
  const mrrEndExisting = end
    .filter((c) => startClienteIds.has(c.cliente_id) || startIds.has(c.id))
    .reduce((sum, c) => sum + ticketMensal(c), 0)
  return mrrEndExisting / mrrStart
}

function ticketMensal(c: Contrato): number {
  return c.tipo === 'anual' ? c.ticket / 12 : c.ticket
}

function isAtivoNaData(c: Contrato, refDate: string): boolean {
  if (c.status !== 'ativo') return false
  if (c.data_inicio > refDate) return false
  if (c.data_fim && c.data_fim < refDate) return false
  return true
}

function addMonths(dateStr: string, months: number): string {
  const parts = dateStr.split('-').map(Number)
  const y = parts[0]!
  const m = parts[1]!
  const d = parts[2]!
  const date = new Date(Date.UTC(y, m - 1 + months, d))
  return date.toISOString().slice(0, 10)
}
