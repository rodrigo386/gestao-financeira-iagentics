import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ForecastChart } from '@/components/forecast-chart'
import { DriversForm } from '@/components/drivers-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Drivers } from '@/lib/schemas/cenario'

export default async function ForecastPage() {
  const supabase = await createClient()

  const { data: cenarios } = await supabase
    .from('forecast_cenarios').select('*').eq('ativo', true).order('nome')

  // Trigger compute if no projecoes exist
  const { count: projecoesCount } = await supabase
    .from('forecast_projecoes').select('cenario_id', { count: 'exact', head: true })
  if ((projecoesCount ?? 0) === 0 && cenarios && cenarios.length > 0) {
    const { recomputarProjecoes } = await import('@/modules/forecast/cenarios')
    await recomputarProjecoes()
  }

  const { data: projecoes } = await supabase
    .from('forecast_projecoes')
    .select('*, cenario:forecast_cenarios(nome)')
    .order('mes_ref')

  const chartRows = ((projecoes as Array<{ mes_ref: string; cenario: { nome: string } | null; caixa: string; receita_total: string; despesa_total: string }>) ?? []).map((p) => ({
    mes_ref: p.mes_ref,
    cenario_nome: p.cenario?.nome ?? '',
    caixa: Number(p.caixa),
    receita_total: Number(p.receita_total),
    despesa_total: Number(p.despesa_total),
  }))

  // Runway summary
  const runways: Record<string, number | null> = {}
  for (const c of cenarios ?? []) {
    const row = (projecoes as Array<{ cenario_id: string; runway_meses: number | null }> | null)?.find((p) => p.cenario_id === c.id)
    runways[c.nome] = row?.runway_meses ?? null
  }

  async function salvarDrivers(cenarioId: string, drivers: Drivers) {
    'use server'
    const { atualizarCenario, recomputarProjecoes } = await import('@/modules/forecast/cenarios')
    await atualizarCenario(cenarioId, { drivers_json: drivers })
    await recomputarProjecoes(cenarioId)
    revalidatePath('/forecast')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Forecast</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(cenarios ?? []).map((c) => (
          <Card key={c.id}>
            <CardHeader><CardTitle>{c.nome}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">Runway</div>
              <div className="text-2xl font-semibold">
                {runways[c.nome] === null ? '&gt; 36 meses' : `${runways[c.nome]} meses`}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Projeção de Caixa (12 meses)</CardTitle></CardHeader>
        <CardContent><ForecastChart rows={chartRows} /></CardContent>
      </Card>

      {(cenarios ?? []).map((c) => (
        <Card key={c.id}>
          <CardHeader><CardTitle>Drivers — {c.nome}</CardTitle></CardHeader>
          <CardContent>
            <DriversForm
              cenarioId={c.id}
              initialDrivers={c.drivers_json as Drivers}
              onSubmit={salvarDrivers}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
