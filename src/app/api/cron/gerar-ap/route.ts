import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { gerarAPMes } from '@/modules/contas-pagar/ap'

export async function POST(request: NextRequest) {
  const naoAutorizado = requireCronAuth(request)
  if (naoAutorizado) return naoAutorizado

  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month')
  const refMonth = monthParam ?? new Date().toISOString().slice(0, 7) + '-01'

  try {
    const result = await gerarAPMes(refMonth)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}
