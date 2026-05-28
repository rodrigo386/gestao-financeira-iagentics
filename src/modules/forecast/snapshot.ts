import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import type { ForecastSnapshot } from './engine'
import type { Contrato } from '@/lib/schemas/contrato'
import { calcularMRR } from '@/modules/receitas/metricas'

export async function loadSnapshot(refDate: string): Promise<ForecastSnapshot> {
  const admin = createServiceClient()

  // Active contracts → MRR
  const { data: contratosRows } = await admin.from('contratos').select('*').eq('status', 'ativo')
  const contratos = (contratosRows ?? []) as Contrato[]
  const mrrAtual = calcularMRR(contratos, refDate)

  // Caixa atual: sum saldo_atual de contas_bancarias ativas
  const { data: contas } = await admin
    .from('contas_bancarias').select('saldo_atual').eq('ativa', true)
  const caixaAtual = (contas ?? []).reduce((s, c) => s + Number(c.saldo_atual), 0)

  // Despesa mensal atual: média dos últimos 90 dias de lancamentos saida
  const ninetyAgo = new Date(new Date(refDate).getTime() - 90 * 86400_000).toISOString().slice(0, 10)
  const { data: lancs } = await admin
    .from('lancamentos').select('valor')
    .eq('tipo', 'saida').gte('data', ninetyAgo).lt('data', refDate)
  const totalSaida90d = (lancs ?? []).reduce((s, l) => s + Number(l.valor), 0)
  const despesaMensalAtual = totalSaida90d / 3   // 3 months

  // AR/AP next 30d
  const in30 = new Date(new Date(refDate).getTime() + 30 * 86400_000).toISOString().slice(0, 10)
  const { data: ars } = await admin
    .from('contas_a_receber').select('valor')
    .in('status', ['previsto', 'emitido', 'atrasado'])
    .gte('data_vencimento', refDate).lte('data_vencimento', in30)
  const arPrevisto30d = (ars ?? []).reduce((s, a) => s + Number(a.valor), 0)

  const { data: aps } = await admin
    .from('contas_a_pagar').select('valor')
    .in('status', ['previsto', 'aprovado', 'atrasado'])
    .gte('data_vencimento', refDate).lte('data_vencimento', in30)
  const apPrevisto30d = (aps ?? []).reduce((s, a) => s + Number(a.valor), 0)

  return {
    mrrAtual: round2(mrrAtual),
    caixaAtual: round2(caixaAtual),
    despesaMensalAtual: round2(despesaMensalAtual),
    arPrevisto30d: round2(arPrevisto30d),
    apPrevisto30d: round2(apPrevisto30d),
    contratosAtivos: contratos.filter((c) => c.status === 'ativo').length,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
