import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { listarAR, atualizarAR, marcarRecebido } from '@/modules/contas-receber/ar'
import { createClient } from '@/lib/supabase/server'
import { ARTable } from '@/components/ar-table'
import type { ARPatch } from '@/components/ar-edit-dialog'
import type { ReceberInput } from '@/components/ar-receber-dialog'
import type { AtualizarARPatch } from '@/lib/schemas/ar'

export default async function ContasReceberPage() {
  const hoje = new Date()
  const em90 = new Date(hoje.getTime() + 90 * 24 * 60 * 60 * 1000)
  const rows = await listarAR({
    vencimento_de: hoje.toISOString().slice(0, 10),
    vencimento_ate: em90.toISOString().slice(0, 10),
  })

  // Type narrowing — the joined cliente is loose, coerce shape
  const typed = (rows as unknown as Parameters<typeof ARTable>[0]['rows'])

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

  async function marcarRecebidoAction(id: string, input: ReceberInput) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('não autenticado')
    const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
    if (!u || !['admin', 'financeiro'].includes(u.role)) throw new Error('sem permissão para marcar recebido')
    await marcarRecebido(id, input.dataRecebimento, input.contaId, input.categoriaId, user.id)
    revalidatePath('/contas-receber')
    revalidatePath('/')
  }

  const supabaseRead = await createClient()
  const [{ data: contasAtivas }, { data: catsReceita }] = await Promise.all([
    supabaseRead.from('contas_bancarias').select('id, banco').eq('ativa', true).order('banco'),
    supabaseRead.from('categorias').select('id, nome').eq('tipo', 'receita').eq('ativa', true).order('nome'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas a Receber</h1>
        <p className="text-sm text-muted-foreground">Próximos 90 dias</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Gerenciar:</span>
        <Link href="/receitas/clientes" className="text-primary underline">Clientes</Link>
        <Link href="/receitas/contratos" className="text-primary underline">Contratos</Link>
      </div>

      <ARTable
        rows={typed}
        onEditar={editarARAction}
        onMarcarRecebido={marcarRecebidoAction}
        contas={contasAtivas ?? []}
        categoriasReceita={catsReceita ?? []}
      />
    </div>
  )
}
