import { describe, it, expect } from 'vitest'
import { buildSlackPayload, colorOf } from '@/lib/slack/client'

describe('buildSlackPayload', () => {
  it('usa cor por severidade e inclui título e mensagem', () => {
    const p = buildSlackPayload({ titulo: 'Saldo baixo', mensagem: 'Conta X', severidade: 'warning' })
    expect(p.attachments[0].color).toBe('#c80')
    const blocks = p.attachments[0].blocks as Array<Record<string, any>>
    expect(blocks[0].type).toBe('header')
    expect(blocks[0].text.text).toBe('Saldo baixo')
    expect(blocks[1].text.text).toBe('Conta X')
  })

  it('inclui linhas e contexto quando fornecidos', () => {
    const p = buildSlackPayload({
      titulo: 'Resumo', mensagem: 'Hoje', linhas: ['linha A', 'linha B'], contexto: { x: 1 },
    })
    const blocks = p.attachments[0].blocks as Array<Record<string, any>>
    expect(blocks.some((b) => b.type === 'section' && b.text.text.includes('linha A'))).toBe(true)
    const ctx = blocks.find((b) => b.type === 'context')
    expect(ctx).toBeTruthy()
    expect(ctx!.elements[0].text).toContain('"x":1')
  })

  it('default severidade info → cor azul', () => {
    expect(colorOf('info')).toBe('#06c')
    const p = buildSlackPayload({ titulo: 'X', mensagem: 'Y' })
    expect(p.attachments[0].color).toBe('#06c')
  })
})
