'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type AlocacaoPatch = {
  pj_id: string
  projeto_id?: string
  descricao: string
  tipo_remuneracao: 'fixo' | 'hora' | 'entregavel'
  valor_total: number
  horas_estimadas?: number
  data_inicio: string
  data_prevista_fim: string
}

export type AlocacaoRowData = AlocacaoPatch & {
  id: string
  status: 'contratado' | 'em_andamento' | 'concluido' | 'pago'
  ap_id?: string
}

type Projeto = { id: string; nome: string }

const TIPO_OPTS = ['fixo', 'hora', 'entregavel'] as const

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  contratado: 'outline',
  em_andamento: 'default',
  concluido: 'secondary',
  pago: 'secondary',
}

function formatBRL(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

export function AlocacaoRow({
  alocacao,
  projetos,
  onEditar,
  onFaturar,
}: {
  alocacao: AlocacaoRowData
  projetos: Projeto[]
  onEditar: (id: string, patch: Partial<AlocacaoPatch>) => Promise<void>
  onFaturar: (id: string, dataReal: string) => Promise<void>
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  const [faturando, startFaturar] = useTransition()
  const [form, setForm] = useState<AlocacaoPatch>({
    pj_id: alocacao.pj_id,
    projeto_id: alocacao.projeto_id ?? '',
    descricao: alocacao.descricao,
    tipo_remuneracao: alocacao.tipo_remuneracao,
    valor_total: alocacao.valor_total,
    horas_estimadas: alocacao.horas_estimadas,
    data_inicio: alocacao.data_inicio,
    data_prevista_fim: alocacao.data_prevista_fim,
  })
  const [err, setErr] = useState<string | null>(null)

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onEditar(alocacao.id, form)
        setEditing(false)
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  function faturar() {
    startFaturar(async () => {
      try {
        await onFaturar(alocacao.id, alocacao.data_prevista_fim)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao faturar')
      }
    })
  }

  if (!editing) {
    return (
      <tr className="border-t">
        <td className="px-4 py-3 font-medium">{alocacao.descricao}</td>
        <td className="px-4 py-3 text-muted-foreground">{alocacao.tipo_remuneracao}</td>
        <td className="px-4 py-3">{formatBRL(alocacao.valor_total)}</td>
        <td className="px-4 py-3">
          <Badge variant={STATUS_VARIANT[alocacao.status] ?? 'outline'}>{alocacao.status}</Badge>
        </td>
        <td className="px-4 py-3 text-muted-foreground text-xs">
          {alocacao.data_inicio} → {alocacao.data_prevista_fim}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {alocacao.status === 'concluido' && !alocacao.ap_id && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={faturar}
              disabled={faturando}
              className="text-xs text-primary underline mr-2"
            >
              {faturando ? '...' : 'Faturar (gerar AP)'}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
          {err && <div className="text-xs text-destructive mt-1">{err}</div>}
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-t bg-muted/30">
      <td className="px-2 py-2">
        <Input
          value={form.descricao}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          placeholder="Descrição"
        />
      </td>
      <td className="px-2 py-2">
        <select
          value={form.tipo_remuneracao}
          onChange={(e) => setForm({ ...form, tipo_remuneracao: e.target.value as AlocacaoPatch['tipo_remuneracao'] })}
          className="border rounded-md px-2 py-1 text-sm bg-background w-full"
        >
          {TIPO_OPTS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={form.valor_total || ''}
          onChange={(e) => setForm({ ...form, valor_total: parseFloat(e.target.value) || 0 })}
          className="w-28"
        />
      </td>
      <td className="px-2 py-2 text-muted-foreground text-xs">
        <Badge variant={STATUS_VARIANT[alocacao.status] ?? 'outline'}>{alocacao.status}</Badge>
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-1 items-center text-xs">
          <Input
            type="date"
            value={form.data_inicio}
            onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
            className="w-32"
          />
          <span>→</span>
          <Input
            type="date"
            value={form.data_prevista_fim}
            onChange={(e) => setForm({ ...form, data_prevista_fim: e.target.value })}
            className="w-32"
          />
        </div>
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <Button type="button" size="sm" onClick={salvar} disabled={pending}>
          {pending ? '...' : 'Salvar'}
        </Button>{' '}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => { setEditing(false); setErr(null) }}
        >
          Cancelar
        </Button>
        {err && <div className="text-xs text-destructive mt-1">{err}</div>}
      </td>
    </tr>
  )
}
