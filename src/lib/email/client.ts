import 'server-only'
import { Resend } from 'resend'
import { z } from 'zod'
import { AlertaSeveridade } from '@/lib/schemas/alerta'

type AlertaSeveridadeType = z.infer<typeof AlertaSeveridade>

type SendInput = {
  to?: string[]                 // default: EMAIL_TO_ADMINS split by comma
  subject: string
  severidade: 'info' | 'warning' | 'critical'
  titulo: string
  mensagem: string
  contexto_json?: Record<string, unknown>
}

export async function sendAlertaEmail(input: SendInput): Promise<{ id: string }> {
  if (process.env.RESEND_MODE !== 'real') {
    return { id: `mock-${Date.now()}` }
  }
  return realSend(input)
}

let _client: Resend | null = null
function getClient() {
  if (_client) return _client
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY required when RESEND_MODE=real')
  _client = new Resend(apiKey)
  return _client
}

async function realSend(input: SendInput): Promise<{ id: string }> {
  const client = getClient()
  const from = process.env.EMAIL_FROM
  if (!from) throw new Error('EMAIL_FROM required when RESEND_MODE=real')

  const to = input.to ?? (process.env.EMAIL_TO_ADMINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (to.length === 0) throw new Error('No recipients (EMAIL_TO_ADMINS not set)')

  const html = `
<h2 style="color: ${colorOf(input.severidade)};">${input.titulo}</h2>
<p>${input.mensagem}</p>
${input.contexto_json ? `<pre style="background:#f5f5f5;padding:8px;font-size:11px;">${JSON.stringify(input.contexto_json, null, 2)}</pre>` : ''}
<hr/>
<p style="font-size: 11px; color: #777;">IAgentics — Sistema de Gestão Financeira</p>
`.trim()

  const r = await client.emails.send({
    from, to, subject: input.subject, html,
  })
  if (r.error) throw new Error(`Resend: ${r.error.message}`)
  return { id: r.data?.id ?? 'sent' }
}

function colorOf(s: AlertaSeveridadeType): string {
  return s === 'critical' ? '#c00' : s === 'warning' ? '#c80' : '#06c'
}
