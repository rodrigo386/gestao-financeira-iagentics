import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { calcularItemFolha } from '@/modules/folha/calculo'
import { buildAPsFromItem } from '@/modules/folha/corrida'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('folha fechamento', () => {
  let db: ReturnType<typeof admin>
  let usuarioId: string
  let funcionarioComBenId: string
  let funcionarioSemBenId: string

  beforeEach(async () => {
    db = admin()
    const { data: authUser } = await db.auth.admin.createUser({
      email: `folha-${Date.now()}@iagentics.test`, email_confirm: true,
    })
    usuarioId = authUser!.user!.id
    await db.from('usuarios').insert({ id: usuarioId, nome: 'FolhaAdmin', role: 'admin' })

    const { data: f1 } = await db.from('funcionarios').insert({
      nome: 'Func ComBen', cargo: 'Eng',
      salario_base: 10000,
      beneficios_json: { vr: 30, vr_dias: 22, va: 800, plano_saude: 600 },
      encargos_pct_json: { fgts: 8, inss_patronal: 20, provisao_13: 8.33, provisao_ferias: 11.11 },
      data_admissao: '2024-01-01',
    }).select().single()
    funcionarioComBenId = f1!.id

    const { data: f2 } = await db.from('funcionarios').insert({
      nome: 'Func SemBen', cargo: 'PM',
      salario_base: 5000,
      beneficios_json: {},
      encargos_pct_json: { fgts: 8, inss_patronal: 20, provisao_13: 8.33, provisao_ferias: 11.11 },
      data_admissao: '2024-06-01',
    }).select().single()
    funcionarioSemBenId = f2!.id
  })

  it('builds itens + APs correctly for closing the run', async () => {
    // Load tax tables
    const { data: tabelas } = await db.from('tabelas_fiscais').select('*').eq('ano', 2026)
    const inss = tabelas!.find((t) => t.tipo === 'inss')!.faixas_json
    const irrf = tabelas!.find((t) => t.tipo === 'irrf')!.faixas_json

    // Create folha — use a month unlikely to conflict with other tests
    const { data: folha } = await db.from('folha')
      .insert({ mes_ref: '2026-05-01', status: 'aberta' }).select().single()

    // Insert itens for our two new funcionarios only
    const { data: funcionarios } = await db.from('funcionarios').select('*')
      .in('id', [funcionarioComBenId, funcionarioSemBenId])
    const itensInput = (funcionarios ?? []).map((f) => ({
      folha_id: folha!.id, funcionario_id: f.id,
      ...calcularItemFolha(f as never, inss as never, irrf as never),
    }))
    const { data: itens } = await db.from('itens_folha').insert(itensInput).select()
    expect(itens).toHaveLength(2)

    // Get categorias for AP generation
    const { data: cats } = await db.from('categorias').select('id, nome')
    const findCat = (nome: string) => cats!.find((c) => c.nome === nome)!.id

    // Build APs for each item
    const allAPs = []
    for (const item of itens!) {
      const func = (funcionarios ?? []).find((f) => f.id === item.funcionario_id)!
      const aps = buildAPsFromItem(item as never, func as never, '2026-05-01', {
        salarioCategoria: findCat('Salário CLT'),
        fgtsCategoria: findCat('FGTS'),
        inssCategoria: findCat('INSS Patronal'),
        beneficiosCategoria: findCat('VR/VA'),
      })
      allAPs.push(...aps)
    }

    // Funcionario com benefícios → 4 APs; sem benefícios → 3 APs (no benefícios AP)
    expect(allAPs.length).toBe(4 + 3)

    // Insert APs
    for (const ap of allAPs) {
      const { error } = await db.from('contas_a_pagar').insert(ap)
      expect(error).toBeNull()
    }

    // Close folha
    const { data: closed } = await db.from('folha')
      .update({ status: 'fechada', fechada_em: new Date().toISOString(), fechada_por: usuarioId })
      .eq('id', folha!.id).select().single()
    expect(closed?.status).toBe('fechada')

    // Verify the APs are queryable from contas_a_pagar
    const { data: createdAPs } = await db.from('contas_a_pagar')
      .select('*').eq('origem', 'folha').in('origem_id', itens!.map((i) => i.id))
    expect(createdAPs?.length).toBe(7)
  })
})
