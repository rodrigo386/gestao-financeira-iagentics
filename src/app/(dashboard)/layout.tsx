import { Sidebar } from '@/components/sidebar'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { count: alertasUnread } = await supabase
    .from('alertas').select('id', { count: 'exact', head: true }).eq('lido', false)

  return (
    <div className="flex min-h-screen">
      <Sidebar alertasUnread={alertasUnread ?? 0} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
