'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type FornecedorFormData = {
  nome: string
  cnpj?: string
  categoria_default_id?: string
  contato_email?: string
  contato_telefone?: string
  observacoes?: string
  ativo: boolean
}

type Categoria = { id: string; nome: string }

type Props = {
  initialData?: Partial<FornecedorFormData>
  onSubmit: (data: FornecedorFormData) => Promise<void>
  submitLabel?: string
  categorias: Categoria[]
}

export function FornecedorForm({ initialData, onSubmit, submitLabel = 'Salvar', categorias }: Props) {
  const [data, setData] = useState<FornecedorFormData>({
    nome: initialData?.nome ?? '',
    cnpj: initialData?.cnpj ?? '',
    categoria_default_id: initialData?.categoria_default_id ?? '',
    contato_email: initialData?.contato_email ?? '',
    contato_telefone: initialData?.contato_telefone ?? '',
    observacoes: initialData?.observacoes ?? '',
    ativo: initialData?.ativo ?? true,
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
        <CardTitle>Fornecedor</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" required value={data.nome} onChange={(e) => setData({ ...data, nome: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={data.cnpj} onChange={(e) => setData({ ...data, cnpj: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoria_default_id">Categoria padrão</Label>
              <select
                id="categoria_default_id"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={data.categoria_default_id}
                onChange={(e) => setData({ ...data, categoria_default_id: e.target.value })}
              >
                <option value="">— Nenhuma —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={data.contato_email} onChange={(e) => setData({ ...data, contato_email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tel">Telefone</Label>
              <Input id="tel" value={data.contato_telefone} onChange={(e) => setData({ ...data, contato_telefone: e.target.value })} />
            </div>
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
              id="ativo"
              type="checkbox"
              checked={data.ativo}
              onChange={(e) => setData({ ...data, ativo: e.target.checked })}
              className="h-4 w-4"
            />
            <Label htmlFor="ativo">Ativo</Label>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button type="submit" disabled={submitting}>{submitting ? 'Salvando...' : submitLabel}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
