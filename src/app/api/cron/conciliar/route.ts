import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { conciliarPendentes } from '@/modules/bancos/conciliar'

export async function POST(request: NextRequest) {
  const naoAutorizado = requireCronAuth(request)
  if (naoAutorizado) return naoAutorizado

  const result = await conciliarPendentes()
  return NextResponse.json(result)
}
