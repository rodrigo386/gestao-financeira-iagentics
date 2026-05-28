'use client'
import { useState } from 'react'
import type { Drivers } from '@/lib/schemas/cenario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const FIELDS: Array<{ key: keyof Drivers; label: string; step?: number; suffix?: string }> = [
  { key: 'novos_clientes_mes',      label: 'Novos clientes/mês',       step: 0.1 },
  { key: 'churn_pct',               label: 'Churn (%)',                 step: 0.1, suffix: '%' },
  { key: 'ticket_medio_novo',       label: 'Ticket médio novo (R$)' },
  { key: 'novos_projetos_mes',      label: 'Novos projetos/mês',        step: 0.1 },
  { key: 'valor_medio_projeto',     label: 'Valor médio projeto (R$)' },
  { key: 'duracao_projeto_meses',   label: 'Duração projeto (meses)' },
  { key: 'crescimento_despesa_pct', label: 'Crescimento despesa (%)',   step: 0.1, suffix: '%' },
]

export function DriversForm({ cenarioId, initialDrivers, onSubmit }: {
  cenarioId: string
  initialDrivers: Drivers
  onSubmit: (cenarioId: string, drivers: Drivers) => Promise<void>
}) {
  const [drivers, setDrivers] = useState<Drivers>(initialDrivers)
  const [saving, setSaving] = useState(false)

  return (
    <form onSubmit={async (e) => {
      e.preventDefault()
      setSaving(true)
      await onSubmit(cenarioId, drivers)
      setSaving(false)
    }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input
              id={f.key}
              type="number"
              step={f.step ?? 1}
              value={drivers[f.key]}
              onChange={(e) => setDrivers({ ...drivers, [f.key]: Number(e.target.value) })}
            />
          </div>
        ))}
      </div>
      <Button type="submit" disabled={saving} className="mt-4">
        {saving ? 'Recalculando...' : 'Salvar e recalcular'}
      </Button>
    </form>
  )
}
