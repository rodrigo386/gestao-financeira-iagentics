'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Cliente } from '@/lib/schemas/cliente'

export type ProjetoFormData = {
  cliente_id: string
  nome: string
  descricao?: string
  valor_total: number
  moeda: string
  data_inicio: string
  data_prevista_fim: string
  status: 'proposta' | 'ativo' | 'pausado' | 'concluido' | 'cancelado'
  observacoes?: string
}

type Props = {
  clientes: Cliente[]
  initialData?: Partial<ProjetoFormData>
  initialClienteId?: string
  onSubmit: (data: ProjetoFormData) => Promise<void>
  submitLabel?: string
}

export function ProjetoForm({ clientes, initialData, initialClienteId, onSubmit, submitLabel = 'Salvar' }: Props) {
  const [data, setData] = useState<ProjetoFormData>({
    cliente_id: initialData?.cliente_id ?? initialClienteId ?? '',
    nome: initialData?.nome ?? '',
    descricao: initialData?.descricao ?? '',
    valor_total: initialData?.valor_total ?? 0,
    moeda: initialData?.moeda ?? 'BRL',
    data_inicio: initialData?.data_inicio ?? '',
    data_prevista_fim: initialData?.data_prevista_fim ?? '',
    status: initialData?.status ?? 'proposta',
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
        <CardTitle>Projeto</CardTitle>
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

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <textarea
              id="descricao"
              className="w-full min-h-[80px] border rounded-md px-3 py-2 text-sm"
              value={data.descricao}
              onChange={(e) => setData({ ...data, descricao: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valor_total">Valor total (R$)</Label>
              <Input
                id="valor_total"
                type="number"
                min={0}
                step={0.01}
                value={data.valor_total}
                onChange={(e) => setData({ ...data, valor_total: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={data.status}
                onChange={(e) => setData({ ...data, status: e.target.value as ProjetoFormData['status'] })}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="proposta">Proposta</option>
                <option value="ativo">Ativo</option>
                <option value="pausado">Pausado</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </select>
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
              <Label htmlFor="data_prevista_fim">Data prevista de fim *</Label>
              <Input
                id="data_prevista_fim"
                type="date"
                required
                value={data.data_prevista_fim}
                onChange={(e) => setData({ ...data, data_prevista_fim: e.target.value })}
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
