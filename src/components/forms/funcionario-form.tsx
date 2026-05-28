'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type BeneficiosJson = {
  vr: number
  vr_dias: number
  va: number
  plano_saude: number
}

export type EncargosJson = {
  fgts: number
  inss_patronal: number
  provisao_13: number
  provisao_ferias: number
}

export type FuncionarioFormData = {
  nome: string
  cpf?: string
  cargo: string
  tipo: 'clt' | 'pj_recorrente'
  salario_base: number
  beneficios_json: BeneficiosJson
  encargos_pct_json: EncargosJson
  centro_custo?: string
  data_admissao: string
  data_desligamento?: string
  chave_pix?: string
  ativo: boolean
}

type Props = {
  initialData?: Partial<FuncionarioFormData>
  onSubmit: (data: FuncionarioFormData) => Promise<void>
  submitLabel?: string
}

const DEFAULT_BENEFICIOS: BeneficiosJson = { vr: 0, vr_dias: 0, va: 0, plano_saude: 0 }
const DEFAULT_ENCARGOS: EncargosJson = {
  fgts: 8,
  inss_patronal: 20,
  provisao_13: 8.33,
  provisao_ferias: 11.11,
}

export function FuncionarioForm({ initialData, onSubmit, submitLabel = 'Salvar' }: Props) {
  const [data, setData] = useState<FuncionarioFormData>({
    nome: initialData?.nome ?? '',
    cpf: initialData?.cpf ?? '',
    cargo: initialData?.cargo ?? '',
    tipo: initialData?.tipo ?? 'clt',
    salario_base: initialData?.salario_base ?? 0,
    beneficios_json: initialData?.beneficios_json ?? { ...DEFAULT_BENEFICIOS },
    encargos_pct_json: initialData?.encargos_pct_json ?? { ...DEFAULT_ENCARGOS },
    centro_custo: initialData?.centro_custo ?? '',
    data_admissao: initialData?.data_admissao ?? '',
    data_desligamento: initialData?.data_desligamento ?? '',
    chave_pix: initialData?.chave_pix ?? '',
    ativo: initialData?.ativo ?? true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function setB(key: keyof BeneficiosJson, val: number) {
    setData((d) => ({ ...d, beneficios_json: { ...d.beneficios_json, [key]: val } }))
  }
  function setE(key: keyof EncargosJson, val: number) {
    setData((d) => ({ ...d, encargos_pct_json: { ...d.encargos_pct_json, [key]: val } }))
  }

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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Identificação */}
      <Card>
        <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" required value={data.nome}
                onChange={(e) => setData({ ...data, nome: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" placeholder="000.000.000-00" value={data.cpf}
                onChange={(e) => setData({ ...data, cpf: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cargo">Cargo *</Label>
              <Input id="cargo" required value={data.cargo}
                onChange={(e) => setData({ ...data, cargo: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo *</Label>
              <select
                id="tipo"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={data.tipo}
                onChange={(e) => setData({ ...data, tipo: e.target.value as 'clt' | 'pj_recorrente' })}
              >
                <option value="clt">CLT</option>
                <option value="pj_recorrente">PJ Recorrente</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="centro_custo">Centro de Custo</Label>
              <Input id="centro_custo" value={data.centro_custo}
                onChange={(e) => setData({ ...data, centro_custo: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chave_pix">Chave PIX</Label>
              <Input id="chave_pix" value={data.chave_pix}
                onChange={(e) => setData({ ...data, chave_pix: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Remuneração */}
      <Card>
        <CardHeader><CardTitle>Remuneração</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="salario_base">Salário Base (R$) *</Label>
            <Input
              id="salario_base"
              type="number"
              step="0.01"
              min="0"
              required
              value={data.salario_base || ''}
              onChange={(e) => setData({ ...data, salario_base: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Benefícios */}
      <Card>
        <CardHeader><CardTitle>Benefícios</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vr">Vale Refeição — valor/dia (R$)</Label>
              <Input id="vr" type="number" step="0.01" min="0"
                value={data.beneficios_json.vr || ''}
                onChange={(e) => setB('vr', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vr_dias">VR — dias úteis/mês</Label>
              <Input id="vr_dias" type="number" step="1" min="0"
                value={data.beneficios_json.vr_dias || ''}
                onChange={(e) => setB('vr_dias', parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="va">Vale Alimentação (R$/mês)</Label>
              <Input id="va" type="number" step="0.01" min="0"
                value={data.beneficios_json.va || ''}
                onChange={(e) => setB('va', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plano_saude">Plano de Saúde (R$/mês)</Label>
              <Input id="plano_saude" type="number" step="0.01" min="0"
                value={data.beneficios_json.plano_saude || ''}
                onChange={(e) => setB('plano_saude', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Encargos */}
      <Card>
        <CardHeader><CardTitle>Encargos (%)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fgts">FGTS (%)</Label>
              <Input id="fgts" type="number" step="0.01" min="0"
                value={data.encargos_pct_json.fgts}
                onChange={(e) => setE('fgts', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inss_patronal">INSS Patronal (%)</Label>
              <Input id="inss_patronal" type="number" step="0.01" min="0"
                value={data.encargos_pct_json.inss_patronal}
                onChange={(e) => setE('inss_patronal', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="provisao_13">Provisão 13º (%)</Label>
              <Input id="provisao_13" type="number" step="0.01" min="0"
                value={data.encargos_pct_json.provisao_13}
                onChange={(e) => setE('provisao_13', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provisao_ferias">Provisão Férias (%)</Label>
              <Input id="provisao_ferias" type="number" step="0.01" min="0"
                value={data.encargos_pct_json.provisao_ferias}
                onChange={(e) => setE('provisao_ferias', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Datas */}
      <Card>
        <CardHeader><CardTitle>Datas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_admissao">Data de Admissão *</Label>
              <Input id="data_admissao" type="date" required value={data.data_admissao}
                onChange={(e) => setData({ ...data, data_admissao: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_desligamento">Data de Desligamento</Label>
              <Input id="data_desligamento" type="date" value={data.data_desligamento}
                onChange={(e) => setData({ ...data, data_desligamento: e.target.value })} />
            </div>
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
        </CardContent>
      </Card>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Salvando...' : submitLabel}
      </Button>
    </form>
  )
}
