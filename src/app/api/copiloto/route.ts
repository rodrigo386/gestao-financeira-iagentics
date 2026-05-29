import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { responder } from '@/modules/copiloto/agente'
import type { Mensagem } from '@/modules/copiloto/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: usuario } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (!usuario || !['admin', 'financeiro'].includes(usuario.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await request.json()) as { historico?: Mensagem[] }
  const historico = (body.historico ?? []).slice(-20) // limita o contexto
  if (historico.length === 0) return NextResponse.json({ error: 'histórico vazio' }, { status: 400 })

  const resposta = await responder(historico)
  return NextResponse.json(resposta)
}
