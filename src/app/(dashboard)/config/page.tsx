import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ConfigPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let isAdmin = false
  if (user) {
    const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
    isAdmin = u?.role === 'admin'
  }

  const itens: { href: string; titulo: string; desc: string }[] = [
    { href: '/config/contas-bancarias', titulo: 'Contas Bancárias', desc: 'Cadastrar contas e ajustar saldo (alimenta o caixa)' },
  ]
  if (isAdmin) {
    itens.push({ href: '/config/usuarios', titulo: 'Usuários', desc: 'Criar/gerenciar usuários (admin)' })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {itens.map((it) => (
          <Link key={it.href} href={it.href}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader><CardTitle className="text-base">{it.titulo}</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{it.desc}</p></CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
