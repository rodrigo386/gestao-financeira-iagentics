import 'server-only'

export type SlackSeveridade = 'info' | 'warning' | 'critical'

export type SlackInput = {
  titulo: string
  mensagem: string
  severidade?: SlackSeveridade
  linhas?: string[]
  contexto?: Record<string, unknown>
}

export function colorOf(s: SlackSeveridade): string {
  return s === 'critical' ? '#c00' : s === 'warning' ? '#c80' : '#06c'
}

/** Monta o payload Block Kit (Incoming Webhook) — função pura, testável sem rede. */
export function buildSlackPayload(input: SlackInput) {
  const sev = input.severidade ?? 'info'
  const blocks: Record<string, unknown>[] = [
    { type: 'header', text: { type: 'plain_text', text: input.titulo.slice(0, 150) } },
    { type: 'section', text: { type: 'mrkdwn', text: input.mensagem } },
  ]
  if (input.linhas && input.linhas.length > 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: input.linhas.join('\n') } })
  }
  if (input.contexto) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '```' + JSON.stringify(input.contexto) + '```' }],
    })
  }
  return { attachments: [{ color: colorOf(sev), blocks }] }
}

/**
 * Posta no Slack via Incoming Webhook. Mock (default) é no-op. Real exige
 * SLACK_WEBHOOK_URL. Espelha o provider de e-mail (SLACK_MODE mock|real).
 */
export async function postSlack(input: SlackInput): Promise<{ ok: boolean; mock?: boolean }> {
  if (process.env.SLACK_MODE !== 'real') {
    return { ok: true, mock: true }
  }
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) throw new Error('SLACK_WEBHOOK_URL required when SLACK_MODE=real')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildSlackPayload(input)),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Slack webhook ${res.status}: ${body.slice(0, 200)}`)
  }
  return { ok: true }
}
