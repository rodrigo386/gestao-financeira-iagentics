import { describe, it, expect } from 'vitest'
import {
  calcularINSSFuncionario,
  calcularIRRF,
  calcularFGTS,
  calcularEncargos,
  calcularItemFolha,
} from '@/modules/folha/calculo'

const INSS_2026 = [
  { ate: 1518.00, aliquota: 7.5, deducao: 0 },
  { ate: 2793.88, aliquota: 9.0, deducao: 22.77 },
  { ate: 4190.83, aliquota: 12.0, deducao: 106.59 },
  { ate: 8157.41, aliquota: 14.0, deducao: 190.40 },
]

const IRRF_2026 = [
  { ate: 2428.80, aliquota: 0, deducao: 0 },
  { ate: 2826.65, aliquota: 7.5, deducao: 182.16 },
  { ate: 3751.05, aliquota: 15.0, deducao: 394.16 },
  { ate: 4664.68, aliquota: 22.5, deducao: 675.49 },
  { ate: 999999999, aliquota: 27.5, deducao: 908.73 },
]

describe('calcularINSSFuncionario', () => {
  it('faixa 1: 1000 → 7.5%', () => {
    // 1000 * 7.5% - 0 = 75
    expect(calcularINSSFuncionario(1000, INSS_2026)).toBeCloseTo(75, 2)
  })
  it('faixa 4: 5000 → cap at last bracket', () => {
    // 5000 * 14% - 190.40 = 509.60
    expect(calcularINSSFuncionario(5000, INSS_2026)).toBeCloseTo(509.6, 2)
  })
  it('teto: salário > último teto contribui no teto', () => {
    // 10000 > 8157.41 → 8157.41 * 14% - 190.40 = 951.638
    expect(calcularINSSFuncionario(10000, INSS_2026)).toBeCloseTo(951.638, 2)
  })
})

describe('calcularIRRF', () => {
  it('faixa isenta: 2000 → 0', () => {
    expect(calcularIRRF(2000, IRRF_2026)).toBe(0)
  })
  it('faixa 7.5%: 2700 → 7.5% * 2700 - 182.16 = 20.34', () => {
    expect(calcularIRRF(2700, IRRF_2026)).toBeCloseTo(20.34, 2)
  })
  it('faixa máxima: 10000 → 27.5% * 10000 - 908.73 = 1841.27', () => {
    expect(calcularIRRF(10000, IRRF_2026)).toBeCloseTo(1841.27, 2)
  })
})

describe('calcularFGTS', () => {
  it('8% do salário bruto', () => {
    expect(calcularFGTS(10000, 8)).toBe(800)
  })
})

describe('calcularEncargos', () => {
  it('calcula todos os encargos do empregador', () => {
    const e = calcularEncargos(10000, {
      fgts: 8,
      inss_patronal: 20,
      provisao_13: 8.33,
      provisao_ferias: 11.11,
    })
    expect(e.fgts).toBe(800)
    expect(e.inss_patronal).toBe(2000)
    expect(e.provisao_13).toBeCloseTo(833, 2)
    expect(e.provisao_ferias).toBeCloseTo(1111, 2)
    expect(e.total).toBeCloseTo(4744, 2)
  })
})

describe('calcularItemFolha', () => {
  const funcionario = {
    salario_base: 10000,
    beneficios_json: { vr: 30, vr_dias: 22, va: 800, plano_saude: 600 },
    encargos_pct_json: { fgts: 8, inss_patronal: 20, provisao_13: 8.33, provisao_ferias: 11.11 },
  }

  it('compõe item de folha com bruto + descontos + encargos', () => {
    const item = calcularItemFolha(funcionario as never, INSS_2026, IRRF_2026)

    expect(item.salario_bruto).toBe(10000)
    expect(item.beneficios_valor).toBe(30 * 22 + 800 + 600)  // 660 + 800 + 600 = 2060
    expect(item.inss_funcionario).toBeCloseTo(951.638, 2)
    // base IRRF = bruto - INSS = 10000 - 951.638 = 9048.362; faixa máxima
    // 9048.362 * 27.5% - 908.73 = 1579.57
    expect(item.irrf).toBeCloseTo(1579.57, 1)
    // liquido = bruto - INSS - IRRF
    expect(item.liquido_pagar).toBeCloseTo(10000 - 951.638 - 1579.57, 1)
    expect(item.fgts).toBe(800)
    expect(item.inss_patronal).toBe(2000)
  })
})
