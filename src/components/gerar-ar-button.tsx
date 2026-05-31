'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export type GerarARResult = {
  refMonth: string
  contratos_ativos: number
  inserted: number
  skipped: number
}

function mesAtual(): string {
  // YYYY-MM no fuso local
  return new Date().toISOString().slice(0, 7)
}

export function GerarARButton({ onGerar }: { onGerar: (month: string) => Promise<GerarARResult> }) {
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
        setMsg(`${r.inserted} AR gerada(s), ${r.skipped} já existia(m) — ${r.contratos_ativos} contrato(s) ativo(s).`)
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao gerar AR')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label htmlFor="ar-mes" className="block text-xs text-muted-foreground">Mês de referência</label>
        <input
          id="ar-mes"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-border rounded-md px-2 py-1 text-sm bg-background"
        />
      </div>
      <Button type="button" onClick={handle} disabled={pending}>
        {pending ? 'Gerando...' : 'Gerar AR do mês'}
      </Button>
      {msg && <span className="text-sm text-emerald-400">{msg}</span>}
      {err && <span className="text-sm text-destructive">{err}</span>}
    </div>
  )
}
