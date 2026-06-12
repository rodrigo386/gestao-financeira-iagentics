import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { montarResumoDiario } from '@/modules/alertas/resumo-diario'
import { postSlack } from '@/lib/slack/client'

function brl(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export async function POST(request: NextRequest) {
  const naoAutorizado = requireCronAuth(request)
  if (naoAutorizado) return naoAutorizado

  const hoje = new Date().toISOString().slice(0, 10)
  const r = await montarResumoDiario(hoje)

  const linhas = [
    `*A receber* — vencendo hoje: ${r.arHoje.count} (${brl(r.arHoje.total)}) · atrasado: ${r.arAtrasado.count} (${brl(r.arAtrasado.total)})`,
    `*A pagar* — vencendo hoje: ${r.apHoje.count} (${brl(r.apHoje.total)}) · atrasado: ${r.apAtrasado.count} (${brl(r.apAtrasado.total)})`,
    `*Pendências de categorização:* ${r.pendencias}`,
  ]

  try {
    await postSlack({ titulo: `Resumo do dia — ${hoje}`, mensagem: 'Ação de hoje', linhas, severidade: 'info' })
  } catch (e) {
    console.error('resumo-diario slack falhou (continuando):', e)
  }

  return NextResponse.json(r)
}
