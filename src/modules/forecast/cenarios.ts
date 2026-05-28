import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NewCenario, Cenario } from '@/lib/schemas/cenario'
import { gerarForecast } from './engine'
import { loadSnapshot } from './snapshot'
import type { z } from 'zod'

export async function listarCenarios() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('forecast_cenarios').select('*').order('nome', { ascending: true })
  if (error) throw new Error(`listarCenarios: ${error.message}`)
  return (data ?? []) as Cenario[]
}

export async function buscarCenario(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('forecast_cenarios').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarCenario: ${error.message}`)
  return data as Cenario | null
}

export async function atualizarCenario(id: string, input: Partial<z.input<typeof NewCenario>>) {
  const parsed = NewCenario.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('forecast_cenarios').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarCenario: ${error.message}`)
  return data as Cenario
}

/**
 * Recompute projections for one or all cenarios. Persists to forecast_projecoes.
 */
export async function recomputarProjecoes(cenarioId?: string, horizonMeses = 12) {
  const admin = createServiceClient()
  const today = new Date()
  const startMes = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '00')}-01`
  const snapshot = await loadSnapshot(startMes)

  let cenarios: Cenario[]
  if (cenarioId) {
    const { data } = await admin.from('forecast_cenarios').select('*').eq('id', cenarioId)
    cenarios = (data ?? []) as Cenario[]
  } else {
    const { data } = await admin.from('forecast_cenarios').select('*').eq('ativo', true)
    cenarios = (data ?? []) as Cenario[]
  }

  for (const c of cenarios) {
    const projecoes = gerarForecast(snapshot, c.drivers_json as never, startMes, horizonMeses)
      .map((p) => ({ ...p, cenario_id: c.id }))

    // Replace existing projections for this cenario
    await admin.from('forecast_projecoes').delete().eq('cenario_id', c.id)
    await admin.from('forecast_projecoes').insert(projecoes)
  }

  return { recomputed: cenarios.length }
}
