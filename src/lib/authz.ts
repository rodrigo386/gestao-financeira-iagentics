import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Lança se o usuário não tiver permissão de escrita (admin ou financeiro).
 * Defense-in-depth para mutações que usam service role (bypassa RLS) — não
 * confiar apenas no gate da server action chamadora.
 */
export async function requireCanWrite(usuarioId: string): Promise<void> {
  const admin = createServiceClient()
  const { data } = await admin.from('usuarios').select('role').eq('id', usuarioId).single()
  if (!data || !['admin', 'financeiro'].includes(data.role)) {
    throw new Error('sem permissão (requer admin ou financeiro)')
  }
}
