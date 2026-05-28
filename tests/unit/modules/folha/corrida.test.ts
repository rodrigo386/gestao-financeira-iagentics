import { describe, it, expect } from 'vitest'
import { buildAPsFromItem } from '@/modules/folha/corrida'
import type { ItemFolha } from '@/lib/schemas/folha'
import type { Funcionario } from '@/lib/schemas/funcionario'

const fc: Funcionario = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  nome: 'Test',
  cpf: null,
  cargo: 'Eng',
  tipo: 'clt',
  salario_base: 10000,
  beneficios_json: { vr: 30, vr_dias: 22, va: 800, plano_saude: 600 },
  encargos_pct_json: {},
  centro_custo: null,
  data_admissao: '2025-01-01',
  data_desligamento: null,
  ativo: true,
  chave_pix: null,
  banco_conta_json: null,
  usuario_id: null,
  criado_em: '2025-01-01T00:00:00Z',
  atualizado_em: '2025-01-01T00:00:00Z',
}

const item: ItemFolha = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  folha_id: '550e8400-e29b-41d4-a716-446655440002',
  funcionario_id: fc.id,
  salario_bruto: 10000,
  beneficios_valor: 2060,
  inss_funcionario: 951.64,
  irrf: 1579.57,
  outros_descontos_json: {},
  liquido_pagar: 7468.79,
  fgts: 800,
  inss_patronal: 2000,
  provisao_13: 833,
  provisao_ferias: 1111,
  total_encargos: 4744,
  criado_em: '2026-05-01T00:00:00Z',
  atualizado_em: '2026-05-01T00:00:00Z',
}

describe('buildAPsFromItem', () => {
  it('builds 4 APs: salário, FGTS, INSS, benefícios (skips zero-value benefícios)', () => {
    const aps = buildAPsFromItem(item, fc, '2026-05-01', {
      salarioCategoria: 'cat-pessoal',
      fgtsCategoria: 'cat-fgts',
      inssCategoria: 'cat-inss',
      beneficiosCategoria: 'cat-vrva',
    })
    expect(aps).toHaveLength(4)

    const sal = aps.find((a) => a.descricao.includes('Salário'))!
    expect(sal.valor).toBe(7468.79)
    expect(sal.tipo_credor).toBe('funcionario')
    expect(sal.credor_id).toBe(fc.id)
    expect(sal.categoria_id).toBe('cat-pessoal')

    const fgts = aps.find((a) => a.descricao.includes('FGTS'))!
    expect(fgts.valor).toBe(800)

    const inss = aps.find((a) => a.descricao.includes('INSS'))!
    // INSS to government = funcionario + patronal
    expect(inss.valor).toBeCloseTo(951.64 + 2000, 2)

    const ben = aps.find((a) => a.descricao.includes('Benefícios'))!
    expect(ben.valor).toBe(2060)
  })

  it('uses correct due dates: salário dia 5, FGTS dia 7, INSS dia 20, benefícios dia 5 of next month', () => {
    const aps = buildAPsFromItem(item, fc, '2026-05-01', {
      salarioCategoria: 'c1', fgtsCategoria: 'c2', inssCategoria: 'c3', beneficiosCategoria: 'c4',
    })
    const sal = aps.find((a) => a.descricao.includes('Salário'))!
    const fgts = aps.find((a) => a.descricao.includes('FGTS'))!
    const inss = aps.find((a) => a.descricao.includes('INSS'))!
    expect(sal.data_vencimento).toBe('2026-06-05')
    expect(fgts.data_vencimento).toBe('2026-06-07')
    expect(inss.data_vencimento).toBe('2026-06-20')
  })

  it('skips zero-value benefícios AP', () => {
    const itemSemBen = { ...item, beneficios_valor: 0 }
    const aps = buildAPsFromItem(itemSemBen, fc, '2026-05-01', {
      salarioCategoria: 'c1', fgtsCategoria: 'c2', inssCategoria: 'c3', beneficiosCategoria: 'c4',
    })
    expect(aps).toHaveLength(3)  // sem o de benefícios
  })
})
