import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Mensagem, RespostaAgente } from './types'
import { TOOLS_LEITURA, executarToolLeitura } from './tools-leitura'
import { ACOES_TOOLS, isAcaoTool, parseProposedAction } from './acoes'

const MODELO = 'claude-sonnet-4-6'
const MAX_ITER = 8

export type ChamarModelo = (params: {
  system: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]
  messages: Anthropic.MessageParam[]
  tools: Anthropic.Tool[]
}) => Promise<Anthropic.Message>

let _client: Anthropic | null = null
function clientChamarModelo(): ChamarModelo {
  return async (params) => {
    if (!_client) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required when LLM_MODE=real')
      _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    }
    return _client.messages.create({ model: MODELO, max_tokens: 1500, ...params })
  }
}

async function systemPrompt(): Promise<string> {
  return readFile(path.join(process.cwd(), 'prompts', 'copiloto', 'SKILL.md'), 'utf-8')
}

function textoDe(m: Anthropic.Message): string {
  return m.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim()
}

/**
 * Loop read-only orchestrator. Executa tools de leitura até o modelo responder em texto
 * ou pedir uma tool de proposta (que é capturada sem executar).
 * `opts.chamarModelo` permite injeção em testes; em produção usa a Messages API.
 */
export async function responder(
  historico: Mensagem[],
  opts: { chamarModelo?: ChamarModelo } = {},
): Promise<RespostaAgente> {
  const chamar = opts.chamarModelo ?? (process.env.LLM_MODE === 'real' ? clientChamarModelo() : mockChamarModelo)
  const sys = await systemPrompt().catch(() => 'Copiloto financeiro IAgentics.')
  const tools = [...TOOLS_LEITURA, ...ACOES_TOOLS]
  const messages: Anthropic.MessageParam[] = historico.map((m) => ({ role: m.role, content: m.content }))

  for (let i = 0; i < MAX_ITER; i++) {
    const resp = await chamar({
      system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
      messages,
      tools,
    })
    if (resp.stop_reason !== 'tool_use') return { mensagem: textoDe(resp) }

    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const proposta = toolUses.find((t) => isAcaoTool(t.name))
    if (proposta) {
      return { mensagem: textoDe(resp), proposta: parseProposedAction(proposta.name, proposta.input) }
    }

    messages.push({ role: 'assistant', content: resp.content })
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (t) => ({
        type: 'tool_result' as const,
        tool_use_id: t.id,
        content: JSON.stringify(await executarToolLeitura(t.name, t.input)),
      })),
    )
    messages.push({ role: 'user', content: results })
  }
  return { mensagem: 'Não consegui concluir dentro do limite de passos. Reformule a pergunta?' }
}

// Mock determinístico para LLM_MODE != real (sem rede). Heurística simples por palavra-chave.
const mockChamarModelo: ChamarModelo = async ({ messages }) => {
  const ultima = [...messages].reverse().find((m) => m.role === 'user')
  const txt = typeof ultima?.content === 'string' ? ultima.content.toLowerCase() : ''
  if (txt.includes('fech') && txt.includes('mes')) {
    return {
      id: 'm', type: 'message', role: 'assistant', model: 'mock', stop_reason: 'tool_use', stop_sequence: null, usage: {} as never,
      content: [{ type: 'tool_use', id: 'tu', name: 'propor_fechar_mes', input: { mes_ref: '2026-04-01' } }],
    } as unknown as Anthropic.Message
  }
  return {
    id: 'm', type: 'message', role: 'assistant', model: 'mock', stop_reason: 'end_turn', stop_sequence: null, usage: {} as never,
    content: [{ type: 'text', text: 'Mock: posso analisar estado atual, histórico, simular cenários e propor ações.' }],
  } as unknown as Anthropic.Message
}
