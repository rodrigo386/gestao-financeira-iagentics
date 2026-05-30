import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  listarUsuarios, criarUsuario, redefinirSenha, trocarRole, removerUsuario,
} from '@/modules/usuarios/usuarios'
import type { Actor, RoleAtribuivel } from '@/modules/usuarios/types'
import { UsuarioCreateForm } from '@/components/usuarios/usuario-create-form'
import { UsuariosTable } from '@/components/usuarios/usuarios-table'

async function getAdminActor(): Promise<Actor> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: row } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (row?.role !== 'admin') redirect('/')
  return { id: user.id, role: row.role }
}

export default async function UsuariosPage() {
  const actor = await getAdminActor()
  const usuarios = await listarUsuarios(actor)

  async function criarAction(input: { email: string; senha: string; nome: string; role: RoleAtribuivel }) {
    'use server'
    const a = await getAdminActor()
    await criarUsuario(input, a)
    revalidatePath('/config/usuarios')
  }
  async function redefinirSenhaAction(userId: string, novaSenha: string) {
    'use server'
    const a = await getAdminActor()
    await redefinirSenha({ userId, novaSenha }, a)
  }
  async function trocarRoleAction(userId: string, role: RoleAtribuivel) {
    'use server'
    const a = await getAdminActor()
    await trocarRole({ userId, role }, a)
    revalidatePath('/config/usuarios')
  }
  async function removerAction(userId: string) {
    'use server'
    const a = await getAdminActor()
    await removerUsuario(userId, a)
    revalidatePath('/config/usuarios')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Usuários</h1>
      <UsuarioCreateForm onCriar={criarAction} />
      <UsuariosTable
        usuarios={usuarios}
        meId={actor.id}
        onRedefinirSenha={redefinirSenhaAction}
        onTrocarRole={trocarRoleAction}
        onRemover={removerAction}
      />
    </div>
  )
}
