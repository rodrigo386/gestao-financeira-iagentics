import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { withAudit } from '@/lib/audit'
import { getEntidade } from './registry'

type Actor = { id: string; role: string }

export async function listarEntidade(key: string, busca?: string): Promise<Record<string, unknown>[]> {
  const ent = getEntidade(key)
  if (!ent) throw new Error(`entidade desconhecida: ${key}`)
  const campos = ['id', ...ent.colunas.map((c) => c.campo)].join(', ')
  const admin = createServiceClient()
  let q = admin.from(ent.table).select(campos).order(ent.buscaCampo).limit(500)
  if (busca && busca.trim()) q = q.ilike(ent.buscaCampo, `%${busca.trim()}%`)
  const { data, error } = await q
  if (error) throw new Error(`listarEntidade(${key}): ${error.message}`)
  return (data ?? []) as unknown as Record<string, unknown>[]
}

export async function excluirEntidade(key: string, id: string, actor: Actor): Promise<void> {
  if (actor.role !== 'admin') throw new Error('apenas admin pode excluir cadastros')
  const ent = getEntidade(key)
  if (!ent) throw new Error(`entidade desconhecida: ${key}`)
  const admin = createServiceClient()
  const { data: before } = await admin.from(ent.table).select('*').eq('id', id).maybeSingle()
  if (!before) throw new Error('registro não encontrado')
  await withAudit(
    {
      usuario_id: actor.id, acao: 'delete', tabela: ent.table, registro_id: id,
      before: before as Record<string, unknown>, after: null, motivo: 'master data: excluir',
    },
    async () => {
      const { error } = await admin.from(ent.table).delete().eq('id', id)
      if (error) {
        if (error.code === '23503') {
          throw new Error('Não é possível excluir: há registros vinculados a este cadastro. Remova/atualize os vínculos primeiro.')
        }
        throw new Error(`excluirEntidade(${key}): ${error.message}`)
      }
    },
  )
}
