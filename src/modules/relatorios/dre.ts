import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

export type DRELinha = { categoria: string; total: number }
export type DRE = {
  mesRef: string
  receitas: DRELinha[]
  despesas: DRELinha[]
  totalReceitas: number
  totalDespesas: number
  resultado: number
}

/** DRE realizada (caixa): agrupa lançamentos do mês por categoria. mesRef = 'YYYY-MM-01'. */
export async function calcularDRE(mesRef: string): Promise<DRE> {
  const [y, m] = mesRef.split('-').map(Number)
  const fim = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10) // último dia do mês
  const admin = createServiceClient()
  const { data, error } = await admin
    .from('lancamentos')
    .select('valor, tipo, categoria:categorias(nome)')
    .gte('data', mesRef)
    .lte('data', fim)
    .neq('tipo', 'transferencia')
  if (error) throw new Error(`calcularDRE: ${error.message}`)

  const recMap = new Map<string, number>()
  const despMap = new Map<string, number>()
  for (const l of data ?? []) {
    const nome = (l.categoria as { nome?: string } | null)?.nome ?? 'Sem categoria'
    const map = l.tipo === 'entrada' ? recMap : despMap
    map.set(nome, (map.get(nome) ?? 0) + Number(l.valor))
  }
  const toLinhas = (mp: Map<string, number>): DRELinha[] =>
    [...mp.entries()].map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total)

  const receitas = toLinhas(recMap)
  const despesas = toLinhas(despMap)
  const totalReceitas = receitas.reduce((s, r) => s + r.total, 0)
  const totalDespesas = despesas.reduce((s, r) => s + r.total, 0)
  return { mesRef, receitas, despesas, totalReceitas, totalDespesas, resultado: totalReceitas - totalDespesas }
}
