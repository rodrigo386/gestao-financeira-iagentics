import { NextRequest, NextResponse } from 'next/server'
import { calcularDRE } from '@/modules/relatorios/dre'

export async function GET(request: NextRequest) {
  const month = new URL(request.url).searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month inválido (use YYYY-MM)' }, { status: 400 })
  }
  const dre = await calcularDRE(`${month}-01`)
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const linhas = ['Secao,Categoria,Valor']
  for (const r of dre.receitas) linhas.push(`Receita,${esc(r.categoria)},${r.total.toFixed(2)}`)
  linhas.push(`Total,Receitas,${dre.totalReceitas.toFixed(2)}`)
  for (const d of dre.despesas) linhas.push(`Despesa,${esc(d.categoria)},${d.total.toFixed(2)}`)
  linhas.push(`Total,Despesas,${dre.totalDespesas.toFixed(2)}`)
  linhas.push(`Total,Resultado,${dre.resultado.toFixed(2)}`)
  return new NextResponse(linhas.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="dre-${month}.csv"`,
    },
  })
}
