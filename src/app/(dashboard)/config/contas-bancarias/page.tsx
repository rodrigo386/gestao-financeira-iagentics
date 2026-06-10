import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { listarContasBancarias, criarContaBancaria, atualizarContaBancaria } from '@/modules/bancos/contas'
import { ContasBancariasAdmin, type NovaConta, type ContaPatch } from '@/components/contas-bancarias/contas-bancarias-admin'

async function getAdminActor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (u?.role !== 'admin') redirect('/')
  return { id: user.id, role: u.role }
}

export default async function ContasBancariasPage() {
  const actor = await getAdminActor()
  const contas = await listarContasBancarias()

  async function criarAction(input: NovaConta) {
    'use server'
    const a = await getAdminActor()
    await criarContaBancaria(input, a)
    revalidatePath('/config/contas-bancarias')
  }
  async function atualizarAction(id: string, patch: ContaPatch) {
    'use server'
    const a = await getAdminActor()
    await atualizarContaBancaria(id, patch, a)
    revalidatePath('/config/contas-bancarias')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Contas Bancárias</h1>
      <p className="text-sm text-muted-foreground">
        O saldo é manual e alimenta o caixa/runway. Ajuste-o para refletir a realidade (lançamentos não recalculam o saldo automaticamente).
      </p>
      <ContasBancariasAdmin contas={contas} onCriar={criarAction} onAtualizar={atualizarAction} />
    </div>
  )
}
