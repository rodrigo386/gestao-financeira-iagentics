import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CopilotoChat } from '@/components/copiloto-chat'
import type { ProposedAction } from '@/modules/copiloto/types'

export default async function CopilotoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: usuario } = await supabase.from('usuarios').select('role').eq('id', user!.id).single()
  if (!usuario || !['admin', 'financeiro'].includes(usuario.role)) redirect('/')

  async function executarAcaoAction(acao: ProposedAction): Promise<{ ok: boolean; detalhe: string }> {
    'use server'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) throw new Error('not authenticated')
    const { data: me } = await sb.from('usuarios').select('role').eq('id', u.id).single()
    if (!me) throw new Error('forbidden')
    const { executarAcao } = await import('@/modules/copiloto/acoes')
    return executarAcao(acao, { id: u.id, role: me.role })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Copiloto Financeiro</h1>
      <p className="text-sm text-muted-foreground">Pergunte sobre MRR, runway, despesas, simule cenários ou peça ações (com confirmação).</p>
      <CopilotoChat executarAcao={executarAcaoAction} />
    </div>
  )
}
