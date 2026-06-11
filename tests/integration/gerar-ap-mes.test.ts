import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { gerarAPMes } from '@/modules/contas-pagar/ap'

// gerarAPMes usa createServiceClient (lê estas envs) — forçar LOCAL
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'

const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function admin() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

describe('gerarAPMes', () => {
  let fornecedorId: string
  let categoriaId: string
  beforeEach(async () => {
    const d = admin()
    const { data: f } = await d.from('fornecedores')
      .insert({ nome: `Forn-${Date.now()}-${Math.floor(Math.random() * 1e6)}` })
      .select().single()
    fornecedorId = f!.id
    const { data: c } = await d.from('categorias').select('id').eq('nome', 'Cloud').single()
    categoriaId = c!.id
  })

  it('gera AP de recorrente ativa e é idempotente', async () => {
    const d = admin()
    await d.from('despesas_recorrentes').insert({
      fornecedor_id: fornecedorId, descricao: `Rec-${Date.now()}`, valor: 500,
      dia_mes: 10, categoria_id: categoriaId, data_inicio: '2026-04-01',
      proxima_geracao: '2026-05-01', ativa: true,
    })

    const r1 = await gerarAPMes('2026-05-01')
    expect(r1.inserted).toBeGreaterThanOrEqual(1)

    // idempotente: segunda chamada não duplica
    const r2 = await gerarAPMes('2026-05-01')
    expect(r2.inserted).toBe(0)
    expect(r2.skipped).toBeGreaterThanOrEqual(1)
  })
})
