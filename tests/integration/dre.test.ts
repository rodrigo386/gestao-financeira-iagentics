import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { calcularDRE } from '@/modules/relatorios/dre'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function db() { return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }

describe('calcularDRE', () => {
  it('agrupa por categoria, separa receita/despesa, ignora transferência e mês de fora', async () => {
    const d = db()
    const { data: conta } = await d.from('contas_bancarias')
      .insert({ banco: `Test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, tipo: 'cc', saldo_atual: 0 }).select().single()
    // Reusa categorias do seed (evita depender do schema/enum de categorias).
    const { data: cats } = await d.from('categorias').select('id, nome').limit(2)
    const catRec = cats![0]!
    const catDesp = cats![1]!
    const contaId = conta!.id

    const base = (over: Record<string, unknown>) => ({
      conta_id: contaId, descricao: 'x', origem: 'manual', ...over,
    })
    await d.from('lancamentos').insert([
      base({ data: '2026-06-10', valor: 1000, tipo: 'entrada', categoria_id: catRec.id }),
      base({ data: '2026-06-15', valor: 500, tipo: 'entrada', categoria_id: catRec.id }),
      base({ data: '2026-06-20', valor: 300, tipo: 'saida', categoria_id: catDesp.id }),
      base({ data: '2026-06-25', valor: 999, tipo: 'transferencia', categoria_id: catDesp.id }),
      base({ data: '2026-07-01', valor: 7777, tipo: 'entrada', categoria_id: catRec.id }),
    ])

    const dre = await calcularDRE('2026-06-01')
    const rec = dre.receitas.find((r) => r.categoria === catRec.nome)
    const desp = dre.despesas.find((r) => r.categoria === catDesp.nome)
    expect(rec?.total).toBe(1500)            // 1000 + 500, exclui julho
    expect(desp?.total).toBe(300)
    expect(dre.totalReceitas).toBeGreaterThanOrEqual(1500)
    expect(dre.resultado).toBe(dre.totalReceitas - dre.totalDespesas)
    // transferência não entra
    expect(dre.despesas.some((r) => r.total === 999)).toBe(false)
  })
})
