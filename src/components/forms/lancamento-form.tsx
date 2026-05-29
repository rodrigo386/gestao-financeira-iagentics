'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type LancamentoFormData = {
  data: string
  tipo: 'entrada' | 'saida'
  conta_id: string
  valor: number
  categoria_id?: string
  fornecedor_id?: string
  cliente_id?: string
  descricao: string
  origem: 'manual'
}

type Conta = { id: string; banco: string; conta?: string | null }
type Categoria = { id: string; nome: string }
type Fornecedor = { id: string; nome: string }
type Cliente = { id: string; nome: string }

type Props = {
  initialData?: Partial<LancamentoFormData>
  onSubmit: (data: LancamentoFormData) => Promise<void>
  submitLabel?: string
  contas: Conta[]
  categorias: Categoria[]
  fornecedores: Fornecedor[]
  clientes: Cliente[]
}

export function LancamentoForm({ initialData, onSubmit, submitLabel = 'Salvar', contas, categorias, fornecedores, clientes }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [data, setData] = useState<LancamentoFormData>({
    data: initialData?.data ?? today,
    tipo: initialData?.tipo ?? 'saida',
    conta_id: initialData?.conta_id ?? '',
    valor: initialData?.valor ?? 0,
    categoria_id: initialData?.categoria_id ?? '',
    fornecedor_id: initialData?.fornecedor_id ?? '',
    cliente_id: initialData?.cliente_id ?? '',
    descricao: initialData?.descricao ?? '',
    origem: 'manual',
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

  if (contas.length === 0) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Adicione uma conta bancária em Configurações para começar a lançar.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Lançamento manual</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data">Data *</Label>
              <Input
                id="data"
                type="date"
                required
                value={data.data}
                onChange={(e) => setData({ ...data, data: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo *</Label>
              <select
                id="tipo"
                required
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={data.tipo}
                onChange={(e) => setData({ ...data, tipo: e.target.value as 'entrada' | 'saida' })}
              >
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="conta_id">Conta *</Label>
              <select
                id="conta_id"
                required
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={data.conta_id}
                onChange={(e) => setData({ ...data, conta_id: e.target.value })}
              >
                <option value="">— Selecione —</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>{c.banco}{c.conta ? ` · ${c.conta}` : ''}</option>
                ))}
              </select>
            </div>
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição *</Label>
            <Input
              id="descricao"
              required
              value={data.descricao}
              onChange={(e) => setData({ ...data, descricao: e.target.value })}
            />
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
              <Label htmlFor="fornecedor_id">Fornecedor (opcional)</Label>
              <select
                id="fornecedor_id"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={data.fornecedor_id}
                onChange={(e) => setData({ ...data, fornecedor_id: e.target.value })}
              >
                <option value="">— Nenhum —</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente_id">Cliente (opcional)</Label>
              <select
                id="cliente_id"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={data.cliente_id}
                onChange={(e) => setData({ ...data, cliente_id: e.target.value })}
              >
                <option value="">— Nenhum —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={submitting}>{submitting ? 'Salvando...' : submitLabel}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
