import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { avaliarTodos } from '@/modules/alertas/evaluator'

export async function POST(request: NextRequest) {
  const naoAutorizado = requireCronAuth(request)
  if (naoAutorizado) return naoAutorizado

  const today = new Date().toISOString().slice(0, 10)
  const stats = await avaliarTodos(today)
  return NextResponse.json(stats)
}
