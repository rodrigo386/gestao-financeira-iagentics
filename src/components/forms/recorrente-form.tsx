'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type RecorrenteFormData = {
  fornecedor_id: string
  descricao: string
  valor: number
  moeda: string
  dia_mes: number
  categoria_id?: string
  data_inicio: string
  data_fim?: string
  proxima_geracao: string
  ativa: boolean
  observacoes?: string
}

type Fornecedor = { id: string; nome: string }
type Categoria = { id: string; nome: string }

type Props = {
  initialData?: Partial<RecorrenteFormData>
  onSubmit: (data: RecorrenteFormData) => Promise<void>
  submitLabel?: string
  fornecedores: Fornecedor[]
  categorias: Categoria[]
}

export function RecorrenteForm({ initialData, onSubmit, submitLabel = 'Salvar', fornecedores, categorias }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [data, setData] = useState<RecorrenteFormData>({
    fornecedor_id: initialData?.fornecedor_id ?? '',
    descricao: initialData?.descricao ?? '',
    valor: initialData?.valor ?? 0,
    moeda: initialData?.moeda ?? 'BRL',
    dia_mes: initialData?.dia_mes ?? 1,
    categoria_id: initialData?.categoria_id ?? '',
    data_inicio: initialData?.data_inicio ?? today,
    data_fim: initialData?.data_fim ?? '',
    proxima_geracao: initialData?.proxima_geracao ?? initialData?.data_inicio ?? today,
    ativa: initialData?.ativa ?? true,
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

  function handleDataInicioChange(val: string) {
    setData((prev) => ({
      ...prev,
      data_inicio: val,
      proxima_geracao: prev.proxima_geracao === prev.data_inicio ? val : prev.proxima_geracao,
    }))
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Despesa recorrente</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fornecedor_id">Fornecedor *</Label>
            <select
              id="fornecedor_id"
              required
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={data.fornecedor_id}
              onChange={(e) => setData({ ...data, fornecedor_id: e.target.value })}
            >
              <option value="">— Selecione —</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição *</Label>
            <Input id="descricao" required value={data.descricao} onChange={(e) => setData({ ...data, descricao: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valor">Valor (R$) *</Label>
              <Input
                id="valor"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={data.valor}
                onChange={(e) => setData({ ...data, valor: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dia_mes">Dia do mês (1–28) *</Label>
              <Input
                id="dia_mes"
                type="number"
                min="1"
                max="28"
                required
                value={data.dia_mes}
                onChange={(e) => setData({ ...data, dia_mes: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="categoria_id">Categoria</Label>
            <select
              id="categoria_id"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={data.categoria_id}
              onChange={(e) => setData({ ...data, categoria_id: e.target.value })}
            >
              <option value="">— Nenhuma —</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_inicio">Data início *</Label>
              <Input
                id="data_inicio"
                type="date"
                required
                value={data.data_inicio}
                onChange={(e) => handleDataInicioChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_fim">Data fim (opcional)</Label>
              <Input
                id="data_fim"
                type="date"
                value={data.data_fim}
                onChange={(e) => setData({ ...data, data_fim: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="proxima_geracao">Próxima geração *</Label>
            <Input
              id="proxima_geracao"
              type="date"
              required
              value={data.proxima_geracao}
              onChange={(e) => setData({ ...data, proxima_geracao: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <textarea
              id="obs"
              className="w-full min-h-[80px] border rounded-md px-3 py-2 text-sm"
              value={data.observacoes}
              onChange={(e) => setData({ ...data, observacoes: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="ativa"
              type="checkbox"
              checked={data.ativa}
              onChange={(e) => setData({ ...data, ativa: e.target.checked })}
              className="h-4 w-4"
            />
            <Label htmlFor="ativa">Ativa</Label>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button type="submit" disabled={submitting}>{submitting ? 'Salvando...' : submitLabel}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
