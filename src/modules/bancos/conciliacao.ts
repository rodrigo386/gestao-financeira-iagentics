import type { BreakClassification } from '@/lib/llm/types'

export type LancamentoBank = {
  id: string
  valor: number
  data: string
  descricao: string
  tipo: 'entrada' | 'saida'
}

export type Candidato = {
  id: string
  valor: number
  data_vencimento: string
  descricao: string
  tipo: 'ap' | 'ar'
}

/**
 * Score 0..1 for how well a candidate matches a lancamento.
 * - value exact (±0.01): +0.5
 * - date within ±1d: +0.3
 * - date within ±3d: +0.1 (instead of the +0.3)
 * - descricao similar (case-insensitive substring): +0.2
 */
export function scoreMatch(lanc: LancamentoBank, c: Candidato): number {
  let s = 0
  if (Math.abs(lanc.valor - c.valor) < 0.01) s += 0.5
  const dayDiff = Math.abs(diffDays(lanc.data, c.data_vencimento))
  if (dayDiff <= 1) s += 0.3
  else if (dayDiff <= 3) s += 0.1
  if (similarDescription(lanc.descricao, c.descricao)) s += 0.2
  return Math.min(1, s)
}

/**
 * Classify the relationship between a Pluggy lancamento and candidates.
 * Implements the break taxonomy from anthropics/financial-services.
 */
export function classificarBreak(
  lanc: LancamentoBank,
  candidatos: Candidato[],
): { classificacao: BreakClassification['classificacao']; melhor_match_id: string | null; score: number; explicacao: string } {
  if (candidatos.length === 0) {
    return {
      classificacao: 'bank-only',
      melhor_match_id: null,
      score: 1,
      explicacao: 'Lançamento sem candidatos AP/AR correspondentes',
    }
  }

  // Find best candidate by score
  const scored = candidatos.map((c) => ({ c, score: scoreMatch(lanc, c) }))
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]!
  const valorMatch = Math.abs(lanc.valor - best.c.valor) < 0.01
  const dayDiff = Math.abs(diffDays(lanc.data, best.c.data_vencimento))

  if (best.score >= 0.8) {
    return {
      classificacao: 'matched',
      melhor_match_id: best.c.id,
      score: best.score,
      explicacao: 'Valor + data + descrição alinhados',
    }
  }

  if (valorMatch && dayDiff > 3) {
    return {
      classificacao: 'timing-break',
      melhor_match_id: best.c.id,
      score: best.score,
      explicacao: `Valor exato, mas vencimento ${dayDiff}d fora da janela`,
    }
  }

  if (!valorMatch && dayDiff <= 1) {
    return {
      classificacao: 'amount-break',
      melhor_match_id: best.c.id,
      score: best.score,
      explicacao: `Mesma data, valor diverge em R$ ${(lanc.valor - best.c.valor).toFixed(2)}`,
    }
  }

  // No clear match
  return {
    classificacao: 'mapping-issue',
    melhor_match_id: best.c.id,
    score: best.score,
    explicacao: 'Divergência em múltiplos campos — revisar manualmente',
  }
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((da - db) / (24 * 60 * 60 * 1000))
}

function similarDescription(a: string, b: string): boolean {
  const an = a.toLowerCase().replace(/[^a-z0-9 ]/g, '')
  const bn = b.toLowerCase().replace(/[^a-z0-9 ]/g, '')
  const tokensA = an.split(/\s+/).filter((t) => t.length > 3)
  const tokensB = bn.split(/\s+/).filter((t) => t.length > 3)
  for (const t of tokensA) {
    if (tokensB.includes(t)) return true
  }
  return false
}
