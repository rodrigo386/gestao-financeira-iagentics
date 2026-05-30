import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Login agora é por senha (sem callback). Mantemos um callback mínimo apenas
// para a troca de code → sessão de eventuais fluxos futuros (ex.: OAuth).
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL('/login?error=exchange_failed', request.url))
  }

  return NextResponse.redirect(new URL(next, request.url))
}
