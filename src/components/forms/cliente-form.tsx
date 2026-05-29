'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type ClienteFormData = {
  nome: string
  cnpj?: string
  segmento?: string
  contato_email?: string
  contato_telefone?: string
  observacoes?: string
}

type Props = {
  initialData?: Partial<ClienteFormData>
  onSubmit: (data: ClienteFormData) => Promise<void>
  submitLabel?: string
}

export function ClienteForm({ initialData, onSubmit, submitLabel = 'Salvar' }: Props) {
  const [data, setData] = useState<ClienteFormData>({
    nome: initialData?.nome ?? '',
    cnpj: initialData?.cnpj ?? '',
    segmento: initialData?.segmento ?? '',
    contato_email: initialData?.contato_email ?? '',
    contato_telefone: initialData?.contato_telefone ?? '',
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
        <CardTitle>Cliente</CardTitle>
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
              <Label htmlFor="segmento">Segmento</Label>
              <Input id="segmento" value={data.segmento} onChange={(e) => setData({ ...data, segmento: e.target.value })} />
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
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={submitting}>{submitting ? 'Salvando...' : submitLabel}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
