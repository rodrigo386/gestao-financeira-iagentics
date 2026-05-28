import 'server-only'
import { matchRegras } from './regras'
import { matchHistorico, type HistoricoEntry } from './historico'
import { classifyCategoria } from '@/lib/llm/client'
import type { Regra } from '@/lib/schemas/regra'

export type CategorizarInput = {
  descricao: string
  valor: number
  fornecedorNome?: string
  regras: Regra[]
  historico: HistoricoEntry[]
  categorias: { id: string; nome: string }[]
}

export type CategorizarResult = {
  categoria_id: string | null
  confianca: number
  metodo: 'regra' | 'historico' | 'llm'
  justificativa: string
  pendente: boolean      // true when confianca <= LIMIAR_PENDENTE
  regra_id?: string
}

export const LIMIAR_PENDENTE = 0.7

/**
 * Cascade orchestrator: regra → historico → LLM. Returns CategorizarResult.
 * Pure orchestrator — does NOT write to DB.
 */
export async function categorizar(input: CategorizarInput): Promise<CategorizarResult> {
  // 1. Regra
  const r = matchRegras(input.regras, input.descricao, input.fornecedorNome)
  if (r) {
    return {
      categoria_id: r.categoria_id,
      confianca: 1.0,
      metodo: 'regra',
      justificativa: `Regra "${r.pattern}" (${r.pattern_tipo})`,
      pendente: false,
      regra_id: r.id,
    }
  }

  // 2. Histórico
  const h = matchHistorico(input.descricao, input.historico)
  if (h) {
    return {
      categoria_id: h.categoria_id,
      confianca: h.confianca,
      metodo: 'historico',
      justificativa: 'Padrão recorrente em histórico',
      pendente: false,
    }
  }

  // 3. LLM
  const llm = await classifyCategoria({
    descricao: input.descricao,
    valor: input.valor,
    categorias: input.categorias,
    exemplosSimilares: input.historico.slice(0, 5).map((e) => ({
      descricao: e.descricao,
      categoria_id: e.categoria_id,
    })),
  })

  return {
    categoria_id: llm.categoria_id,
    confianca: llm.confianca,
    metodo: 'llm',
    justificativa: llm.justificativa,
    pendente: llm.confianca <= LIMIAR_PENDENTE,
  }
}
