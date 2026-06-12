import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { montarResumoDiario } from '@/modules/alertas/resumo-diario'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function admin() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

describe('montarResumoDiario', () => {
  let clienteId: string
  beforeEach(async () => {
    const d = admin()
    const { data: c } = await d.from('clientes')
      .insert({ nome: `Cli-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, status: 'ativo' })
      .select().single()
    clienteId = c!.id
  })

  it('conta AR/AP vencendo hoje e atrasados', async () => {
    const d = admin()
    const HOJE = '2026-09-15'
    const ANTES = '2026-09-01'

    // AR vencendo hoje + AR atrasada (origem 'avulso' dispensa origem_id)
    await d.from('contas_a_receber').insert({
      cliente_id: clienteId, origem: 'avulso', valor: 1000, moeda: 'BRL',
      data_emissao: '2026-09-01', data_vencimento: HOJE, status: 'previsto',
    })
    await d.from('contas_a_receber').insert({
      cliente_id: clienteId, origem: 'avulso', valor: 700, moeda: 'BRL',
      data_emissao: '2026-08-01', data_vencimento: ANTES, status: 'previsto',
    })
    // AP vencendo hoje
    await d.from('contas_a_pagar').insert({
      tipo_credor: 'fornecedor', origem: 'avulso', descricao: `AP-${Date.now()}`,
      valor: 300, moeda: 'BRL', data_vencimento: HOJE, status: 'previsto',
    })

    const r = await montarResumoDiario(HOJE)
    expect(r.arHoje.count).toBeGreaterThanOrEqual(1)
    expect(r.arHoje.total).toBeGreaterThanOrEqual(1000)
    expect(r.arAtrasado.count).toBeGreaterThanOrEqual(1)
    expect(r.apHoje.count).toBeGreaterThanOrEqual(1)
    expect(typeof r.pendencias).toBe('number')
  })
})
