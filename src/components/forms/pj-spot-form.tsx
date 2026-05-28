'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type PJSpotFormData = {
  nome: string
  cpf_cnpj?: string
  especialidade?: string
  contato_email?: string
  contato_telefone?: string
  valor_hora_padrao?: number
  ativo: boolean
}

type Props = {
  initialData?: Partial<PJSpotFormData>
  onSubmit: (data: PJSpotFormData) => Promise<void>
  submitLabel?: string
}

export function PJSpotForm({ initialData, onSubmit, submitLabel = 'Salvar' }: Props) {
  const [data, setData] = useState<PJSpotFormData>({
    nome: initialData?.nome ?? '',
    cpf_cnpj: initialData?.cpf_cnpj ?? '',
    especialidade: initialData?.especialidade ?? '',
    contato_email: initialData?.contato_email ?? '',
    contato_telefone: initialData?.contato_telefone ?? '',
    valor_hora_padrao: initialData?.valor_hora_padrao ?? undefined,
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
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Erro desconhecido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>PJ Spot (Prestador)</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" required value={data.nome}
              onChange={(e) => setData({ ...data, nome: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpf_cnpj">CPF / CNPJ</Label>
              <Input id="cpf_cnpj" value={data.cpf_cnpj}
                onChange={(e) => setData({ ...data, cpf_cnpj: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="especialidade">Especialidade</Label>
              <Input id="especialidade" value={data.especialidade}
                onChange={(e) => setData({ ...data, especialidade: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={data.contato_email}
                onChange={(e) => setData({ ...data, contato_email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tel">Telefone</Label>
              <Input id="tel" value={data.contato_telefone}
                onChange={(e) => setData({ ...data, contato_telefone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="valor_hora_padrao">Valor Hora Padrão (R$)</Label>
            <Input
              id="valor_hora_padrao"
              type="number"
              step="0.01"
              min="0"
              value={data.valor_hora_padrao ?? ''}
              onChange={(e) => setData({ ...data, valor_hora_padrao: e.target.value ? parseFloat(e.target.value) : undefined })}
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
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
