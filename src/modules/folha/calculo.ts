import type { Funcionario } from '@/lib/schemas/funcionario'
import type { NewItemFolha } from '@/lib/schemas/folha'

export type FaixaFiscal = { ate: number; aliquota: number; deducao: number }

/**
 * Cálculo de INSS do funcionário (desconto progressivo com teto).
 * Se salário > teto, usa o teto como base.
 */
export function calcularINSSFuncionario(salarioBruto: number, faixas: FaixaFiscal[]): number {
  if (faixas.length === 0) return 0
  const teto = faixas[faixas.length - 1]!.ate
  const base = Math.min(salarioBruto, teto)
  const faixa = encontrarFaixa(base, faixas)
  return round2(base * (faixa.aliquota / 100) - faixa.deducao)
}

/**
 * Cálculo de IRRF (sobre base = bruto - INSS, simplificado sem dependentes).
 */
export function calcularIRRF(baseCalculo: number, faixas: FaixaFiscal[]): number {
  if (faixas.length === 0) return 0
  const faixa = encontrarFaixa(baseCalculo, faixas)
  const imposto = baseCalculo * (faixa.aliquota / 100) - faixa.deducao
  return Math.max(0, round2(imposto))
}

export function calcularFGTS(salarioBruto: number, aliquotaPct: number): number {
  return round2(salarioBruto * (aliquotaPct / 100))
}

export type EncargosPct = {
  fgts: number
  inss_patronal: number
  provisao_13: number
  provisao_ferias: number
}

export function calcularEncargos(salarioBruto: number, pct: EncargosPct) {
  const fgts = round2(salarioBruto * (pct.fgts / 100))
  const inss_patronal = round2(salarioBruto * (pct.inss_patronal / 100))
  const provisao_13 = round2(salarioBruto * (pct.provisao_13 / 100))
  const provisao_ferias = round2(salarioBruto * (pct.provisao_ferias / 100))
  return {
    fgts,
    inss_patronal,
    provisao_13,
    provisao_ferias,
    total: round2(fgts + inss_patronal + provisao_13 + provisao_ferias),
  }
}

/**
 * Compose a full payroll item from a funcionario, using the provided tax tables.
 * Returns a NewItemFolha-shaped object (without folha_id/funcionario_id — set by caller).
 */
export function calcularItemFolha(
  funcionario: Funcionario,
  inssFaixas: FaixaFiscal[],
  irrfFaixas: FaixaFiscal[],
): Omit<NewItemFolha, 'folha_id' | 'funcionario_id'> {
  const bruto = funcionario.salario_base
  const beneficiosValor = computeBeneficios(funcionario.beneficios_json)
  const inssFuncionario = calcularINSSFuncionario(bruto, inssFaixas)
  const baseIRRF = bruto - inssFuncionario
  const irrf = calcularIRRF(baseIRRF, irrfFaixas)
  const liquido = round2(bruto - inssFuncionario - irrf)

  const encargos = calcularEncargos(bruto, {
    fgts: numFromJson(funcionario.encargos_pct_json, 'fgts'),
    inss_patronal: numFromJson(funcionario.encargos_pct_json, 'inss_patronal'),
    provisao_13: numFromJson(funcionario.encargos_pct_json, 'provisao_13'),
    provisao_ferias: numFromJson(funcionario.encargos_pct_json, 'provisao_ferias'),
  })

  return {
    salario_bruto: bruto,
    beneficios_valor: beneficiosValor,
    inss_funcionario: inssFuncionario,
    irrf,
    liquido_pagar: liquido,
    fgts: encargos.fgts,
    inss_patronal: encargos.inss_patronal,
    provisao_13: encargos.provisao_13,
    provisao_ferias: encargos.provisao_ferias,
    total_encargos: encargos.total,
  }
}

function encontrarFaixa(valor: number, faixas: FaixaFiscal[]): FaixaFiscal {
  for (const f of faixas) {
    if (valor <= f.ate) return f
  }
  return faixas[faixas.length - 1]!
}

function computeBeneficios(beneficios: Record<string, unknown>): number {
  const vr = numOr0(beneficios['vr'])
  const vrDias = numOr0(beneficios['vr_dias'])
  const va = numOr0(beneficios['va'])
  const planoSaude = numOr0(beneficios['plano_saude'])
  const planoDental = numOr0(beneficios['plano_dental'])
  return round2(vr * vrDias + va + planoSaude + planoDental)
}

function numOr0(v: unknown): number {
  return typeof v === 'number' ? v : 0
}

function numFromJson(json: Record<string, unknown>, key: string): number {
  const v = json[key]
  return typeof v === 'number' ? v : 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
