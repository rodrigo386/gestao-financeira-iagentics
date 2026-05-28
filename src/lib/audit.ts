import { createServiceClient } from '@/lib/supabase/service'

export type AuditEntry = {
  usuario_id: string
  acao: 'insert' | 'update' | 'delete' | 'custom'
  tabela: string
  registro_id: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  motivo?: string
  contexto?: Record<string, unknown>
}

/**
 * Wraps a sensitive mutation. The operation runs first; only on success is the
 * audit row written. If audit insert fails, the error is thrown (operation
 * already happened — alerting beats silent loss).
 */
export async function withAudit<T>(
  entry: AuditEntry,
  op: () => Promise<T>,
): Promise<T> {
  const result = await op()

  const supabase = createServiceClient()
  const { error } = await supabase.from('audit_log').insert({
    usuario_id: entry.usuario_id,
    acao: entry.acao,
    tabela: entry.tabela,
    registro_id: entry.registro_id,
    before_json: entry.before,
    after_json: entry.after,
    motivo: entry.motivo ?? null,
    contexto_json: entry.contexto ?? null,
  })

  if (error) throw new Error(`audit write failed: ${error.message}`)
  return result
}
