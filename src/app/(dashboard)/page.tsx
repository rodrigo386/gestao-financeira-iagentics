import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nome, role')
    .eq('id', user!.id)
    .single()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-neutral-600">
        Olá, <strong>{usuario?.nome ?? user!.email}</strong> ({usuario?.role ?? '?'}).
      </p>
      <p className="text-sm text-neutral-500">
        Os módulos serão preenchidos nas próximas fases. Use o menu lateral para navegar
        — links inativos retornarão 404 até a fase correspondente.
      </p>
    </div>
  )
}
