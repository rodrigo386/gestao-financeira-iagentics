'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type RegraFormData = {
  pattern: string
  pattern_tipo: 'contains' | 'regex' | 'starts_with' | 'exact'
  campo: 'descricao' | 'fornecedor_nome'
  categoria_id: string
  prioridade: number
  ativa: boolean
}

type Categoria = { id: string; nome: string }

type Props = {
  initialData?: Partial<RegraFormData>
  onSubmit: (data: RegraFormData) => Promise<void>
  submitLabel?: string
  categorias: Categoria[]
}

export function RegraForm({ initialData, onSubmit, submitLabel = 'Salvar', categorias }: Props) {
  const [data, setData] = useState<RegraFormData>({
    pattern: initialData?.pattern ?? '',
    pattern_tipo: initialData?.pattern_tipo ?? 'contains',
    campo: initialData?.campo ?? 'descricao',
    categoria_id: initialData?.categoria_id ?? '',
    prioridade: initialData?.prioridade ?? 100,
    ativa: initialData?.ativa ?? true,
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
        <CardTitle>Regra de Categorização</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pattern">Pattern *</Label>
            <Input
              id="pattern"
              required
              value={data.pattern}
              onChange={(e) => setData({ ...data, pattern: e.target.value })}
              placeholder="ex: spotify, netflix, aluguel"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pattern_tipo">Tipo de match *</Label>
              <select
                id="pattern_tipo"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={data.pattern_tipo}
                onChange={(e) => setData({ ...data, pattern_tipo: e.target.value as RegraFormData['pattern_tipo'] })}
              >
                <option value="contains">contains (contém)</option>
                <option value="starts_with">starts_with (começa com)</option>
                <option value="exact">exact (exato)</option>
                <option value="regex">regex</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="campo">Campo *</Label>
              <select
                id="campo"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={data.campo}
                onChange={(e) => setData({ ...data, campo: e.target.value as RegraFormData['campo'] })}
              >
                <option value="descricao">descricao</option>
                <option value="fornecedor_nome">fornecedor_nome</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="categoria_id">Categoria *</Label>
              <select
                id="categoria_id"
                required
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={data.categoria_id}
                onChange={(e) => setData({ ...data, categoria_id: e.target.value })}
              >
                <option value="">— Selecione —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Input
                id="prioridade"
                type="number"
                value={data.prioridade}
                onChange={(e) => setData({ ...data, prioridade: parseInt(e.target.value, 10) || 100 })}
              />
            </div>
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
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
