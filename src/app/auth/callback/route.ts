import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=exchange_failed', request.url))
  }

  // ensure usuarios row exists (first-login bootstrap)
  const admin = createServiceClient()
  await admin.from('usuarios').upsert(
    {
      id: data.user.id,
      nome: data.user.email?.split('@')[0] ?? 'Usuário',
      role: await firstUserShouldBeAdmin(admin) ? 'admin' : 'leitura',
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )

  return NextResponse.redirect(new URL(next, request.url))
}

async function firstUserShouldBeAdmin(admin: ReturnType<typeof createServiceClient>) {
  const { count } = await admin
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
  return (count ?? 0) === 0
}
