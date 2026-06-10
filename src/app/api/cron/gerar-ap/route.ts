import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { gerarAPDeRecorrente, proximaGeracao } from '@/modules/contas-pagar/gerador'
import { inserirAPBatch } from '@/modules/contas-pagar/ap'
import type { DespesaRecorrente } from '@/lib/schemas/despesa_recorrente'

export async function POST(request: NextRequest) {
  const naoAutorizado = requireCronAuth(request)
  if (naoAutorizado) return naoAutorizado

  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month')
  const refMonth = monthParam ?? new Date().toISOString().slice(0, 7) + '-01'

  const admin = createServiceClient()
  const { data: recorrentes, error } = await admin
    .from('despesas_recorrentes')
    .select('*')
    .eq('ativa', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const newAPs = (recorrentes as DespesaRecorrente[])
    .map((r) => gerarAPDeRecorrente(r, refMonth))
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const result = await inserirAPBatch(newAPs)

  // Update proxima_geracao for each recorrente that generated an AP
  for (const r of recorrentes as DespesaRecorrente[]) {
    if (gerarAPDeRecorrente(r, refMonth) !== null) {
      const next = proximaGeracao(refMonth, r.dia_mes)
      await admin.from('despesas_recorrentes').update({ proxima_geracao: next }).eq('id', r.id)
    }
  }

  return NextResponse.json({ refMonth, recorrentes_ativas: recorrentes.length, ...result })
}
