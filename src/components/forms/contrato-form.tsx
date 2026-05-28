'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Cliente } from '@/lib/schemas/cliente'

export type ContratoFormData = {
  cliente_id: string
  nome: string
  tipo: 'mensal' | 'anual'
  ticket: number
  moeda: string
  dia_cobranca: number
  data_inicio: string
  data_fim?: string
  status: 'ativo' | 'pausado' | 'churned'
  observacoes?: string
}

type Props = {
  clientes: Cliente[]
  initialData?: Partial<ContratoFormData>
  initialClienteId?: string
  onSubmit: (data: ContratoFormData) => Promise<void>
  submitLabel?: string
}

export function ContratoForm({ clientes, initialData, initialClienteId, onSubmit, submitLabel = 'Salvar' }: Props) {
  const [data, setData] = useState<ContratoFormData>({
    cliente_id: initialData?.cliente_id ?? initialClienteId ?? '',
    nome: initialData?.nome ?? '',
    tipo: initialData?.tipo ?? 'mensal',
    ticket: initialData?.ticket ?? 0,
    moeda: initialData?.moeda ?? 'BRL',
    dia_cobranca: initialData?.dia_cobranca ?? 1,
    data_inicio: initialData?.data_inicio ?? '',
    data_fim: initialData?.data_fim ?? '',
    status: initialData?.status ?? 'ativo',
    observacoes: initialData?.observacoes ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    try {
      await onSubmit(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Contrato</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cliente_id">Cliente *</Label>
            <select
              id="cliente_id"
              required
              value={data.cliente_id}
              onChange={(e) => setData({ ...data, cliente_id: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Selecione um cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              required
              value={data.nome}
              onChange={(e) => setData({ ...data, nome: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo</Label>
              <select
                id="tipo"
                value={data.tipo}
                onChange={(e) => setData({ ...data, tipo: e.target.value as 'mensal' | 'anual' })}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={data.status}
                onChange={(e) => setData({ ...data, status: e.target.value as 'ativo' | 'pausado' | 'churned' })}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="ativo">Ativo</option>
                <option value="pausado">Pausado</option>
                <option value="churned">Churned</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticket">Ticket (R$)</Label>
              <Input
                id="ticket"
                type="number"
                min={0}
                step={0.01}
                value={data.ticket}
                onChange={(e) => setData({ ...data, ticket: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dia_cobranca">Dia de cobrança (1–28)</Label>
              <Input
                id="dia_cobranca"
                type="number"
                min={1}
                max={28}
                value={data.dia_cobranca}
                onChange={(e) => setData({ ...data, dia_cobranca: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_inicio">Data início *</Label>
              <Input
                id="data_inicio"
                type="date"
                required
                value={data.data_inicio}
                onChange={(e) => setData({ ...data, data_inicio: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_fim">Data fim</Label>
              <Input
                id="data_fim"
                type="date"
                value={data.data_fim}
                onChange={(e) => setData({ ...data, data_fim: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <textarea
              id="observacoes"
              className="w-full min-h-[80px] border rounded-md px-3 py-2 text-sm"
              value={data.observacoes}
              onChange={(e) => setData({ ...data, observacoes: e.target.value })}
            />
          </div>

          {/* hidden moeda field — defaulted to BRL, not exposed in UI */}
          <input type="hidden" value={data.moeda} />

          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button type="submit" disabled={submitting}>{submitting ? 'Salvando...' : submitLabel}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
