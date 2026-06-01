import { calcularDRE } from '@/modules/relatorios/dre'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function fmt(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams
  const mes = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7)
  const dre = await calcularDRE(`${mes}-01`)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Relatórios — DRE (realizada)</h1>
        <div className="flex items-end gap-3">
          <form method="get" className="flex items-end gap-2">
            <div className="space-y-1">
              <label htmlFor="month" className="block text-xs text-muted-foreground">Mês</label>
              <input id="month" name="month" type="month" defaultValue={mes}
                className="border border-border rounded-md px-2 py-1 text-sm bg-background" />
            </div>
            <Button type="submit" variant="outline">Ver</Button>
          </form>
          <a href={`/api/relatorios/dre.csv?month=${mes}`}>
            <Button type="button">Exportar CSV</Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Receitas</CardTitle></CardHeader>
          <CardContent>
            {dre.receitas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem receitas no mês.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {dre.receitas.map((r) => (
                  <li key={r.categoria} className="flex justify-between">
                    <span className="text-muted-foreground">{r.categoria}</span>
                    <span className="text-emerald-400">{fmt(r.total)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total receitas</span><span className="text-emerald-400">{fmt(dre.totalReceitas)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Despesas</CardTitle></CardHeader>
          <CardContent>
            {dre.despesas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem despesas no mês.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {dre.despesas.map((r) => (
                  <li key={r.categoria} className="flex justify-between">
                    <span className="text-muted-foreground">{r.categoria}</span>
                    <span className="text-rose-400">{fmt(r.total)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total despesas</span><span className="text-rose-400">{fmt(dre.totalDespesas)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-lg font-semibold">Resultado</span>
          <span className={`text-2xl font-semibold ${dre.resultado >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {fmt(dre.resultado)}
          </span>
        </CardContent>
      </Card>
    </div>
  )
}
