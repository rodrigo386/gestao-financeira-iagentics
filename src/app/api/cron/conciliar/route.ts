import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { conciliarPendentes } from '@/modules/bancos/conciliar'

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await conciliarPendentes()
  return NextResponse.json(result)
}
