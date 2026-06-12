import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { sendAlertaEmail } from '@/lib/email/client'
import { postSlack } from '@/lib/slack/client'
import type { NewAlerta } from '@/lib/schemas/alerta'

/**
 * Persists alert in DB (dedup: same tipo within last 24h skipped) and sends email if severity >= warning.
 */
export async function notificarAlerta(input: NewAlerta) {
  const admin = createServiceClient()

  // Dedup: was an alert of same tipo created in the last 24h?
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: recent } = await admin
    .from('alertas')
    .select('id')
    .eq('tipo', input.tipo)
    .gte('criado_em', oneDayAgo)
    .limit(1)
  if (recent && recent.length > 0) {
    return { skipped: true, reason: 'duplicate within 24h' }
  }

  // Insert
  const { data: alerta, error } = await admin.from('alertas').insert(input).select().single()
  if (error) throw new Error(`notificarAlerta insert: ${error.message}`)

  // Notifica canais se warning/critical (Slack é o canal real; e-mail fica em mock)
  if (input.severidade === 'warning' || input.severidade === 'critical') {
    try {
      await postSlack({
        titulo: input.titulo,
        mensagem: input.mensagem,
        severidade: input.severidade,
        contexto: input.contexto_json,
      })
    } catch (e) {
      console.error('alerta slack failed (continuing):', e)
    }
    try {
      await sendAlertaEmail({
        subject: `[${input.severidade.toUpperCase()}] ${input.titulo}`,
        severidade: input.severidade,
        titulo: input.titulo,
        mensagem: input.mensagem,
        contexto_json: input.contexto_json,
      })
    } catch (e) {
      console.error('alerta email failed (continuing):', e)
    }
  }

  return { inserted: true, id: (alerta as { id: string }).id }
}
