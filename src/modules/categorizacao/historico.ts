export type HistoricoEntry = {
  descricao: string
  categoria_id: string
  fornecedor_id?: string | null
}

/**
 * Given a descricao + recent categorized lancamentos, look for a stable pattern:
 * - take the first meaningful word of descricao (skip <=3 char tokens)
 * - find entries whose descricao starts with the same first word
 * - if >=3 matches AND a majority categoria_id, return it
 */
export function matchHistorico(
  descricao: string,
  history: HistoricoEntry[],
): { categoria_id: string; confianca: number } | null {
  const tokens = descricao.split(/\s+/).filter((t) => t.length >= 3)
  if (tokens.length === 0) return null
  const firstToken = tokens[0]!.toLowerCase()

  const matches = history.filter((h) =>
    h.descricao.toLowerCase().split(/\s+/)[0] === firstToken
  )
  if (matches.length < 3) return null

  const counts = new Map<string, number>()
  for (const m of matches) {
    counts.set(m.categoria_id, (counts.get(m.categoria_id) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted[0]!
  // Majority threshold: top must be at least 60% of matches
  if (top[1] / matches.length < 0.6) return null
  return { categoria_id: top[0], confianca: 0.9 }
}
