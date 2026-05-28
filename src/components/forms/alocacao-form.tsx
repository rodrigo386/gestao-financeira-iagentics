'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type AlocacaoFormData = {
  pj_id: string
  projeto_id?: string
  descricao: string
  tipo_remuneracao: 'fixo' | 'hora' | 'entregavel'
  valor_total: number
  horas_estimadas?: number
  data_inicio: string
  data_prevista_fim: string
}

type Projeto = { id: string; nome: string }

type Props = {
  pjId: string
  projetos: Projeto[]
  onSubmit: (data: AlocacaoFormData) => Promise<void>
}

export function AlocacaoForm({ pjId, projetos, onSubmit }: Props) {
  const [data, setData] = useState<AlocacaoFormData>({
    pj_id: pjId,
    projeto_id: '',
    descricao: '',
    tipo_remuneracao: 'fixo',
    valor_total: 0,
    horas_estimadas: undefined,
    data_inicio: '',
    data_prevista_fim: '',
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
    <form onSubmit={handleSubmit} className="space-y-4 border rounded-md p-4 bg-neutral-50 dark:bg-neutral-900">
      <h3 className="font-medium text-sm">Nova Alocação</h3>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição *</Label>
        <Input id="descricao" required value={data.descricao}
          onChange={(e) => setData({ ...data, descricao: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="projeto_id">Projeto</Label>
          <select
            id="projeto_id"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={data.projeto_id}
            onChange={(e) => setData({ ...data, projeto_id: e.target.value })}
          >
            <option value="">— Nenhum —</option>
            {projetos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tipo_remuneracao">Tipo de Remuneração *</Label>
          <select
            id="tipo_remuneracao"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={data.tipo_remuneracao}
            onChange={(e) => setData({ ...data, tipo_remuneracao: e.target.value as AlocacaoFormData['tipo_remuneracao'] })}
          >
            <option value="fixo">Fixo</option>
            <option value="hora">Por Hora</option>
            <option value="entregavel">Entregável</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="valor_total">Valor Total (R$) *</Label>
          <Input
            id="valor_total"
            type="number"
            step="0.01"
            min="0"
            required
            value={data.valor_total || ''}
            onChange={(e) => setData({ ...data, valor_total: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="horas_estimadas">Horas Estimadas</Label>
          <Input
            id="horas_estimadas"
            type="number"
            step="0.5"
            min="0"
            value={data.horas_estimadas ?? ''}
            onChange={(e) => setData({ ...data, horas_estimadas: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="data_inicio">Data de Início *</Label>
          <Input id="data_inicio" type="date" required value={data.data_inicio}
            onChange={(e) => setData({ ...data, data_inicio: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="data_prevista_fim">Data Prevista de Fim *</Label>
          <Input id="data_prevista_fim" type="date" required value={data.data_prevista_fim}
            onChange={(e) => setData({ ...data, data_prevista_fim: e.target.value })} />
        </div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? 'Criando...' : 'Criar alocação'}
      </Button>
    </form>
  )
}
