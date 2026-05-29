import 'server-only'
import type { MetricasMes } from './snapshot'
import { montarLinhasVariancia } from './variancia'
import { gerarCommentaryMensal } from '@/lib/llm/client'
import type { CommentaryResult } from '@/lib/llm/types'

const THRESHOLDS = { pct: 5, abs: 50 }

/**
 * Orquestra o comentário mensal: monta variância MoM, filtra por materialidade e
 * delega ao LLM (read-only). Atalhos sem custo de LLM quando não há base ou variação.
 */
export async function gerarCommentary(
  atual: MetricasMes,
  anterior: MetricasMes | null,
): Promise<CommentaryResult> {
  if (!anterior) {
    return { resumo: 'Primeiro mês fechado, sem base de comparação mês-a-mês.', destaques: [] }
  }

  const materiais = montarLinhasVariancia(atual, anterior, THRESHOLDS).filter((l) => l.material)
  if (materiais.length === 0) {
    return { resumo: 'Mês estável: nenhuma variação material vs. o mês anterior.', destaques: [] }
  }

  return gerarCommentaryMensal({
    mes_ref: atual.mes_ref,
    linhas: materiais.map((l) => ({
      linha: l.linha,
      atual: l.atual,
      anterior: l.anterior,
      delta: l.delta,
      delta_pct: l.delta_pct,
    })),
    thresholds: THRESHOLDS,
  })
}
