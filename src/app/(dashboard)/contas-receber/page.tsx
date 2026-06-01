import { revalidatePath } from 'next/cache'
import { listarAR, gerarARMes, atualizarAR } from '@/modules/contas-receber/ar'
import { createClient } from '@/lib/supabase/server'
import { withAudit } from '@/lib/audit'
import { ARTable } from '@/components/ar-table'
import type { ARPatch } from '@/components/ar-edit-dialog'
import type { AtualizarARPatch } from '@/lib/schemas/ar'
import { GerarARButton, type GerarARResult } from '@/components/gerar-ar-button'

export default async function ContasReceberPage() {
  const hoje = new Date()
  const em90 = new Date(hoje.getTime() + 90 * 24 * 60 * 60 * 1000)
  const rows = await listarAR({
    vencimento_de: hoje.toISOString().slice(0, 10),
    vencimento_ate: em90.toISOString().slice(0, 10),
  })

  // Type narrowing — the joined cliente is loose, coerce shape
  const typed = (rows as unknown as Parameters<typeof ARTable>[0]['rows'])

  async function gerarAction(month: string): Promise<GerarARResult> {
    'use server'
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('mês inválido')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('não autenticado')
    const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
    if (!u || !['admin', 'financeiro'].includes(u.role)) {
      throw new Error('sem permissão para gerar AR (requer admin ou financeiro)')
    }
    const refMonth = `${month}-01`
    const result = await withAudit(
      {
        usuario_id: user.id, acao: 'custom', tabela: 'contas_a_receber', registro_id: refMonth,
        before: null, after: { mes_ref: refMonth }, motivo: 'gerar AR do mês (manual)',
      },
      async () => gerarARMes(refMonth),
    )
    revalidatePath('/contas-receber')
    return result
  }

  async function editarARAction(id: string, patch: ARPatch) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('não autenticado')
    const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
    if (!u || !['admin', 'financeiro'].includes(u.role)) throw new Error('sem permissão para editar AR')
    await atualizarAR(id, patch as AtualizarARPatch, user.id)
    revalidatePath('/contas-receber')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas a Receber</h1>
        <p className="text-sm text-muted-foreground">Próximos 90 dias</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Gere as AR previstas dos contratos ativos para um mês. Idempotente — não duplica AR já criadas.
        </p>
        <GerarARButton onGerar={gerarAction} />
      </div>
      <ARTable rows={typed} onEditar={editarARAction} />
    </div>
  )
}
