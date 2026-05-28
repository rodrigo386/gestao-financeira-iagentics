import { redirect } from 'next/navigation'
import { criarRecorrente } from '@/modules/despesas/recorrentes'
import { listarFornecedores } from '@/modules/despesas/fornecedores'
import { createClient } from '@/lib/supabase/server'
import { RecorrenteForm } from '@/components/forms/recorrente-form'

export default async function NovaRecorrentePage() {
  const supabase = await createClient()
  const [fornecedores, { data: categorias }] = await Promise.all([
    listarFornecedores({ ativo: true }),
    supabase.from('categorias').select('id, nome').eq('tipo', 'despesa').eq('ativa', true).order('nome'),
  ])

  async function action(formData: {
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
  }) {
    'use server'
    const cleaned = {
      fornecedor_id: formData.fornecedor_id,
      descricao: formData.descricao,
      valor: formData.valor,
      moeda: formData.moeda as 'BRL' | 'USD' | 'EUR',
      dia_mes: formData.dia_mes,
      categoria_id: formData.categoria_id?.trim() || undefined,
      data_inicio: formData.data_inicio,
      data_fim: formData.data_fim?.trim() || undefined,
      proxima_geracao: formData.proxima_geracao || formData.data_inicio,
      ativa: formData.ativa,
      observacoes: formData.observacoes?.trim() || undefined,
    }
    const recorrente = await criarRecorrente(cleaned)
    redirect(`/despesas/recorrentes/${recorrente.id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nova despesa recorrente</h1>
      <RecorrenteForm
        onSubmit={action}
        submitLabel="Criar recorrente"
        fornecedores={fornecedores}
        categorias={categorias ?? []}
      />
    </div>
  )
}
