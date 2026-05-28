import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { gerarARDoContrato } from '@/modules/contas-receber/gerador'
import { inserirARBatch } from '@/modules/contas-receber/ar'
import type { Contrato } from '@/lib/schemas/contrato'

export async function POST(request: NextRequest) {
  // Auth: shared secret in Authorization header
  const expected = process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Determine reference month (param or current month)
  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month')
  const refMonth = monthParam ?? new Date().toISOString().slice(0, 7) + '-01'

  // Fetch all active contracts
  const admin = createServiceClient()
  const { data: contratos, error } = await admin
    .from('contratos')
    .select('*')
    .eq('status', 'ativo')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generate AR for each
  const newARs = (contratos as Contrato[])
    .map((c) => gerarARDoContrato(c, refMonth))
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const result = await inserirARBatch(newARs)
  return NextResponse.json({ refMonth, contratos_ativos: contratos.length, ...result })
}
