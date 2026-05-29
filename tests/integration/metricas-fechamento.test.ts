import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.LLM_MODE = 'mock'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient('http://127.0.0.1:54321', SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('fecharMes', () => {
  beforeEach(async () => {
    const db = admin()
    await db.from('metricas_mensais').delete().neq('mes_ref', '1900-01-01')
  })

  it('grava snapshot do mês com receita/despesa/resultado e commentary', async () => {
    const db = admin()
    const mes = '2026-03-01'

    // lancamentos.conta_id is NOT NULL with FK to contas_bancarias — must seed conta first
    const { data: contaSeed } = await db
      .from('contas_bancarias')
      .insert({ banco: `T-${Date.now()}`, tipo: 'cc', saldo_atual: 40000 })
      .select('id')
      .single()
    const contaId = contaSeed!.id

    // Seed lancamentos do mês (conta_id is required; other optional columns use defaults)
    await db.from('lancamentos').insert([
      {
        tipo: 'entrada',
        valor: 12000,
        data: '2026-03-05',
        descricao: `e-${Date.now()}`,
        conciliado: true,
        conta_id: contaId,
      },
      {
        tipo: 'saida',
        valor: 8000,
        data: '2026-03-10',
        descricao: `s-${Date.now()}`,
        conciliado: true,
        conta_id: contaId,
      },
    ])

    const { fecharMes } = await import('@/modules/metricas/fechamento')
    const { data: u } = await db.from('usuarios').select('id').limit(1).maybeSingle()
    await fecharMes(mes, u?.id ?? null as unknown as string)

    const { data: row } = await db.from('metricas_mensais').select('*').eq('mes_ref', mes).single()
    expect(Number(row!.receita_total)).toBeGreaterThanOrEqual(12000)
    expect(Number(row!.despesa_total)).toBeGreaterThanOrEqual(8000)
    expect(row!.commentary_resumo).toBeTruthy()
  })

  it('é idempotente — re-fechar regrava sem duplicar', async () => {
    const db = admin()
    const mes = '2026-03-01'
    const { fecharMes } = await import('@/modules/metricas/fechamento')
    const { data: u } = await db.from('usuarios').select('id').limit(1).maybeSingle()

    await fecharMes(mes, u?.id ?? null as unknown as string)
    await fecharMes(mes, u?.id ?? null as unknown as string)

    const { count } = await db
      .from('metricas_mensais').select('mes_ref', { count: 'exact', head: true }).eq('mes_ref', mes)
    expect(count).toBe(1)
  })
})
