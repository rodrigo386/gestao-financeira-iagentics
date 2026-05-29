import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { responder } from '@/modules/copiloto/agente'

function msgTexto(text: string): Anthropic.Message {
  return { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } as never, content: [{ type: 'text', text }] } as unknown as Anthropic.Message
}
function msgToolUse(name: string, input: unknown, id = 'tu1'): Anthropic.Message {
  return { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } as never, content: [{ type: 'tool_use', id, name, input }] } as unknown as Anthropic.Message
}

describe('responder (loop com chamarModelo injetado)', () => {
  it('retorna texto quando o modelo não pede tool', async () => {
    const r = await responder([{ role: 'user', content: 'oi' }], { chamarModelo: async () => msgTexto('Olá!') })
    expect(r.mensagem).toBe('Olá!')
    expect(r.proposta).toBeUndefined()
  })

  it('captura proposta sem executar', async () => {
    const r = await responder([{ role: 'user', content: 'feche abril' }], {
      chamarModelo: async () => msgToolUse('propor_fechar_mes', { mes_ref: '2026-04-01' }),
    })
    expect(r.proposta).toEqual({ tipo: 'fechar_mes', mes_ref: '2026-04-01' })
  })
})
