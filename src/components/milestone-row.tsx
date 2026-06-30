'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type MilestonePatch = {
  ordem: number
  descricao: string
  valor: number
  data_prevista: string
  status: 'pendente' | 'em_andamento' | 'concluido' | 'faturado' | 'pago'
}

export type MilestoneRowData = MilestonePatch & { id: string }

const STATUS_OPTS = ['pendente', 'em_andamento', 'concluido', 'faturado', 'pago'] as const

function badgeVariant(status: string): 'default' | 'secondary' {
  return status === 'concluido' || status === 'faturado' || status === 'pago' ? 'default' : 'secondary'
}

export function MilestoneRow({
  milestone,
  onEditar,
}: {
  milestone: MilestoneRowData
  onEditar: (id: string, patch: MilestonePatch) => Promise<void>
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  const [form, setForm] = useState<MilestonePatch>({
    ordem: milestone.ordem,
    descricao: milestone.descricao,
    valor: milestone.valor,
    data_prevista: milestone.data_prevista,
    status: milestone.status,
  })
  const [err, setErr] = useState<string | null>(null)

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onEditar(milestone.id, form)
        setEditing(false)
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  if (!editing) {
    return (
      <tr className="border-t">
        <td className="px-4 py-3 text-muted-foreground">{milestone.ordem}</td>
        <td className="px-4 py-3 font-medium">{milestone.descricao}</td>
        <td className="px-4 py-3 text-muted-foreground">
          R$ {milestone.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{milestone.data_prevista}</td>
        <td className="px-4 py-3"><Badge variant={badgeVariant(milestone.status)}>{milestone.status}</Badge></td>
        <td className="px-4 py-3 text-right">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>Editar</Button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-t bg-muted/30">
      <td className="px-2 py-2">
        <Input type="number" min={1} value={form.ordem}
          onChange={(e) => setForm({ ...form, ordem: parseInt(e.target.value) || 1 })} className="w-16" />
      </td>
      <td className="px-2 py-2">
        <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
      </td>
      <td className="px-2 py-2">
        <Input type="number" min={0} step={0.01} value={form.valor}
          onChange={(e) => setForm({ ...form, valor: parseFloat(e.target.value) || 0 })} className="w-28" />
      </td>
      <td className="px-2 py-2">
        <Input type="date" value={form.data_prevista}
          onChange={(e) => setForm({ ...form, data_prevista: e.target.value })} />
      </td>
      <td className="px-2 py-2">
        <select value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as MilestonePatch['status'] })}
          className="border rounded-md px-2 py-1 text-sm bg-background">
          {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <Button type="button" size="sm" onClick={salvar} disabled={pending}>{pending ? '...' : 'Salvar'}</Button>{' '}
        <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setErr(null) }}>Cancelar</Button>
        {err && <div className="text-xs text-destructive mt-1">{err}</div>}
      </td>
    </tr>
  )
}
