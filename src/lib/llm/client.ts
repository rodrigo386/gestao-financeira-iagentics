import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { CategoriaSuggestion, BreakClassification } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type ClassifyCategoriaInput = {
  descricao: string
  valor: number
  categorias: { id: string; nome: string }[]
  exemplosSimilares: { descricao: string; categoria_id: string }[]
}

type ClassifyBreakInput = {
  lancamento: { id: string; valor: number; data: string; descricao: string }
  candidatos: { id: string; tipo: 'ap' | 'ar'; valor: number; data: string; descricao: string }[]
}

/**
 * Read-only LLM orchestrator. Returns Zod-validated JSON. NEVER receives a
 * Supabase client. Writes happen in dedicated server handlers post-validation.
 *
 * Mode controlled by env var `LLM_MODE` (mock | real). Mock mode returns a
 * deterministic best-effort guess based on simple string match.
 */
export async function classifyCategoria(input: ClassifyCategoriaInput): Promise<CategoriaSuggestion> {
  if (process.env.LLM_MODE !== 'real') {
    return mockClassifyCategoria(input)
  }
  return realClassifyCategoria(input)
}

export async function classifyBreak(input: ClassifyBreakInput): Promise<BreakClassification> {
  if (process.env.LLM_MODE !== 'real') {
    return mockClassifyBreak(input)
  }
  return realClassifyBreak(input)
}

// ===== mock =====

function mockClassifyCategoria(input: ClassifyCategoriaInput): CategoriaSuggestion {
  const desc = input.descricao.toLowerCase()
  // Best-effort string-match against categoria names; otherwise pick first w/ low confidence
  const matched = input.categorias.find((c) => desc.includes(c.nome.toLowerCase()))
  if (matched) {
    return {
      categoria_id: matched.id,
      confianca: 0.85,
      justificativa: `Mock: descrição contém "${matched.nome}"`,
    }
  }
  return {
    categoria_id: input.categorias[0]?.id ?? null,
    confianca: 0.4,
    justificativa: 'Mock: nenhum match óbvio, retornando primeira categoria com baixa confiança',
  }
}

function mockClassifyBreak(input: ClassifyBreakInput): BreakClassification {
  if (input.candidatos.length === 0) {
    return {
      classificacao: 'bank-only',
      melhor_match_id: null,
      score: 1,
      explicacao: 'Mock: sem candidatos',
    }
  }
  const c = input.candidatos[0]!
  const sameValue = Math.abs(c.valor - input.lancamento.valor) < 0.01
  const sameDate = c.data === input.lancamento.data
  if (sameValue && sameDate) {
    return {
      classificacao: 'matched',
      melhor_match_id: c.id,
      score: 0.95,
      explicacao: 'Mock: valor + data batem',
    }
  }
  if (sameValue && !sameDate) {
    return {
      classificacao: 'timing-break',
      melhor_match_id: c.id,
      score: 0.7,
      explicacao: 'Mock: valor bate, data fora da janela',
    }
  }
  return {
    classificacao: 'mapping-issue',
    melhor_match_id: c.id,
    score: 0.3,
    explicacao: 'Mock: divergência não-classificada',
  }
}

// ===== real (Anthropic SDK + prompt caching) =====

let _client: Anthropic | null = null
function getClient() {
  if (_client) return _client
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY required when LLM_MODE=real')
  }
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

async function readSkillPrompt(name: 'categorizacao' | 'reconciliacao'): Promise<string> {
  const p = path.join(process.cwd(), 'prompts', name, 'SKILL.md')
  return readFile(p, 'utf-8')
}

async function realClassifyCategoria(input: ClassifyCategoriaInput): Promise<CategoriaSuggestion> {
  const sys = await readSkillPrompt('categorizacao')
  const client = getClient()

  const categoriasList = input.categorias.map((c) => `- ${c.id}: ${c.nome}`).join('\n')
  const userText = `
Lançamento a categorizar:
- Descrição: ${input.descricao}
- Valor: R$ ${input.valor.toFixed(2)}

Categorias disponíveis:
${categoriasList}

${input.exemplosSimilares.length > 0 ? `Exemplos recentes:\n${input.exemplosSimilares.map((e) => `- "${e.descricao}" → ${e.categoria_id}`).join('\n')}` : ''}

Retorne APENAS um JSON com {"categoria_id": "<uuid ou null>", "confianca": <0..1>, "justificativa": "<máx 300 chars>"}.
`.trim()

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: [
      { type: 'text', text: sys, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Categorias: ${categoriasList}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userText }],
  })

  const text = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
  const parsed = extractJSON(text)
  return CategoriaSuggestion.parse(parsed)
}

async function realClassifyBreak(input: ClassifyBreakInput): Promise<BreakClassification> {
  const sys = await readSkillPrompt('reconciliacao')
  const client = getClient()

  const candidatosList = input.candidatos.map((c) =>
    `- ${c.id} [${c.tipo}]: R$ ${c.valor.toFixed(2)} em ${c.data} — "${c.descricao}"`
  ).join('\n')

  const userText = `
Lançamento Pluggy a classificar:
- ID: ${input.lancamento.id}
- Valor: R$ ${input.lancamento.valor.toFixed(2)}
- Data: ${input.lancamento.data}
- Descrição: ${input.lancamento.descricao}

Candidatos AP/AR:
${candidatosList || '(nenhum)'}

Retorne APENAS um JSON com {"classificacao": "<uma das 7 categorias>", "melhor_match_id": "<uuid ou null>", "score": <0..1>, "explicacao": "<máx 300 chars>"}.
`.trim()

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: [
      { type: 'text', text: sys, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userText }],
  })

  const text = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
  const parsed = extractJSON(text)
  return BreakClassification.parse(parsed)
}

function extractJSON(text: string): unknown {
  // Strip markdown fence if present
  const m = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  const raw = m ? m[1]! : text
  return JSON.parse(raw)
}
