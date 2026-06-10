import { NextRequest, NextResponse } from 'next/server'

/**
 * Autentica chamadas de cron via Bearer CRON_SECRET. Retorna uma resposta 401
 * genérica quando o secret falta OU o header está errado — sem distinguir os
 * dois casos para o chamador. Se a env CRON_SECRET não estiver configurada,
 * loga no servidor (ops vê no log) e mesmo assim responde 401.
 * Retorna null quando autorizado.
 */
export function requireCronAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    console.error('cron: CRON_SECRET não configurado — requisição rejeitada')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}
