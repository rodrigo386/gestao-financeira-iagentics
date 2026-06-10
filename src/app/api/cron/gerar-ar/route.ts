import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { gerarARMes } from '@/modules/contas-receber/ar'

export async function POST(request: NextRequest) {
  // Auth: shared secret in Authorization header
  const naoAutorizado = requireCronAuth(request)
  if (naoAutorizado) return naoAutorizado

  // Determine reference month (param or current month)
  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month')
  const refMonth = monthParam ?? new Date().toISOString().slice(0, 7) + '-01'

  try {
    const result = await gerarARMes(refMonth)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}
