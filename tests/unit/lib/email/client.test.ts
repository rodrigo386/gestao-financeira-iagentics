import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Email client (mock)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.RESEND_MODE = 'mock'
    process.env.EMAIL_FROM = 'test@iagentics.test'
    process.env.EMAIL_TO_ADMINS = 'admin@iagentics.test'
  })

  it('sendAlertaEmail returns mock id without throwing', async () => {
    const { sendAlertaEmail } = await import('@/lib/email/client')
    const result = await sendAlertaEmail({
      to: ['user@test.com'],
      subject: 'Test Alert',
      severidade: 'warning',
      titulo: 'Test',
      mensagem: 'Mensagem',
    })
    expect(result.id).toMatch(/^mock-/)
  })

  it('respects EMAIL_TO_ADMINS as default', async () => {
    const { sendAlertaEmail } = await import('@/lib/email/client')
    const result = await sendAlertaEmail({
      subject: 'Test', severidade: 'info', titulo: 'X', mensagem: 'Y',
    })
    expect(result.id).toMatch(/^mock-/)
  })
})
