import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { gerarARMes } from '@/modules/contas-receber/ar'

// gerarARMes usa createServiceClient (lê estas envs) — forçar LOCAL
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'

const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function admin() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

describe('gerarARMes', () => {
  let clienteId: string
  beforeEach(async () => {
    const d = admin()
    const { data: c } = await d.from('clientes')
      .insert({ nome: `Acme-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, status: 'ativo' })
      .select().single()
    clienteId = c!.id
  })

  it('gera AR de contrato vigente, ignora contrato futuro e é idempotente', async () => {
    const d = admin()
    // vigente: começou no mês anterior
    await d.from('contratos').insert({
      cliente_id: clienteId, nome: 'Vigente', tipo: 'mensal', ticket: 1000,
      dia_cobranca: 10, data_inicio: '2026-04-01', status: 'ativo',
    })
    // futuro: começa depois do mês de referência
    await d.from('contratos').insert({
      cliente_id: clienteId, nome: 'Futuro', tipo: 'mensal', ticket: 5000,
      dia_cobranca: 5, data_inicio: '2026-07-01', status: 'ativo',
    })

    const r1 = await gerarARMes('2026-05-01')
    expect(r1.inserted).toBeGreaterThanOrEqual(1)

    const { data: ars } = await d.from('contas_a_receber')
      .select('valor, origem, data_vencimento').eq('cliente_id', clienteId)
    expect(ars!.some((a) => Number(a.valor) === 1000 && a.origem === 'contrato')).toBe(true)
    expect(ars!.some((a) => Number(a.valor) === 5000)).toBe(false) // futuro não gera

    // idempotente: segunda chamada não duplica
    const r2 = await gerarARMes('2026-05-01')
    expect(r2.inserted).toBe(0)
    expect(r2.skipped).toBeGreaterThanOrEqual(1)
  })
})
