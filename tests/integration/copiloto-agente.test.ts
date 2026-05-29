import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { responder } from '@/modules/copiloto/agente'

function msgTexto(text: string): Anthropic.Message {
  return { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } as never, content: [{ type: 'text', text }] } as unknown as Anthropic.Message
}
function msgToolUse(name: string, input: unknown, id = 'tu1'): Anthropic.Message {
  return { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } as never, content: [{ type: 'tool_use', id, name, input }] } as unknown as Anthropic.Message
}

describe('responder — loop com tool de leitura (requer DB)', () => {
  it('executa tool de leitura e depois retorna texto', async () => {
    let call = 0
    const r = await responder([{ role: 'user', content: 'qual o estado?' }], {
      chamarModelo: async () => {
        call++
        return call === 1 ? msgToolUse('get_estado_atual', {}) : msgTexto('Seu MRR está estável.')
      },
    })
    expect(call).toBe(2)
    expect(r.mensagem).toContain('MRR')
  })
})
