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

  // Bootstrap usuarios row. The role assignment uses a single SQL statement to
  // avoid a TOCTOU race when two new users sign in concurrently: the first INSERT
  // that wins the unique constraint on (role='admin') gets admin; the others
  // fall back to leitura via the partial index conflict.
  //
  // The partial unique index `usuarios_admin_singleton` (see migration 0005) enforces
  // "at most one admin exists at any time during bootstrap". If a non-admin user later
  // needs to be promoted, an admin explicitly updates the role.
  const admin = createServiceClient()
  const userName = data.user.email?.split('@')[0] ?? 'Usuário'

  // First try as admin; if a partial-unique-violation occurs (another admin exists),
  // fall back to leitura.
  const { error: adminInsertErr } = await admin.from('usuarios').insert({
    id: data.user.id,
    nome: userName,
    role: 'admin',
  })

  if (adminInsertErr) {
    // Either the user already exists (rerun) or another admin already exists.
    // In both cases, ensure a row exists with leitura as default.
    await admin.from('usuarios').insert({
      id: data.user.id,
      nome: userName,
      role: 'leitura',
    }).then(({ error: leituraErr }) => {
      // If this also fails, the row already exists from a prior login — ignore.
      if (leituraErr && !leituraErr.message.toLowerCase().includes('duplicate')) {
        console.error('usuarios bootstrap unexpected error:', leituraErr)
      }
    })
  }

  return NextResponse.redirect(new URL(next, request.url))
}
