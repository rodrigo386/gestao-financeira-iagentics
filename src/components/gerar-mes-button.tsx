'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export type GerarMesResult = { inserted: number; skipped: number } & Record<string, unknown>

function mesAtual(): string {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

export function GerarMesButton({
  id,
  label,
  pendingLabel,
  onGerar,
  formatMsg,
}: {
  id: string
  label: string
  pendingLabel: string
  onGerar: (month: string) => Promise<GerarMesResult>
  formatMsg: (r: GerarMesResult) => string
}) {
  const router = useRouter()
  const [month, setMonth] = useState(mesAtual())
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function handle() {
    setErr(null)
    setMsg(null)
    start(async () => {
      try {
        const r = await onGerar(month)
        setMsg(formatMsg(r))
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao gerar')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label htmlFor={id} className="block text-xs text-muted-foreground">Mês de referência</label>
        <input
          id={id}
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-border rounded-md px-2 py-1 text-sm bg-background"
        />
      </div>
      <Button type="button" onClick={handle} disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      {msg && <span className="text-sm text-emerald-400">{msg}</span>}
      {err && <span className="text-sm text-destructive">{err}</span>}
    </div>
  )
}
