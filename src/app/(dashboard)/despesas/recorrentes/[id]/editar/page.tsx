import { notFound, redirect } from 'next/navigation'
import { buscarRecorrente, atualizarRecorrente } from '@/modules/despesas/recorrentes'
import { listarFornecedores } from '@/modules/despesas/fornecedores'
import { createClient } from '@/lib/supabase/server'
import { RecorrenteForm, type RecorrenteFormData } from '@/components/forms/recorrente-form'

export default async function EditarRecorrentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const recorrente = await buscarRecorrente(id)
  if (!recorrente) notFound()

  const supabase = await createClient()
  const [fornecedores, { data: categorias }] = await Promise.all([
    listarFornecedores({ ativo: true }),
    supabase.from('categorias').select('id, nome').eq('tipo', 'despesa').eq('ativa', true).order('nome'),
  ])

  async function action(formData: RecorrenteFormData) {
    'use server'
    await atualizarRecorrente(id, {
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
    })
    redirect(`/despesas/recorrentes/${id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar despesa recorrente</h1>
      <RecorrenteForm
        initialData={{
          fornecedor_id: recorrente.fornecedor_id,
          descricao: recorrente.descricao,
          valor: recorrente.valor,
          moeda: recorrente.moeda,
          dia_mes: recorrente.dia_mes,
          categoria_id: recorrente.categoria_id ?? undefined,
          data_inicio: recorrente.data_inicio,
          data_fim: recorrente.data_fim ?? undefined,
          proxima_geracao: recorrente.proxima_geracao,
          ativa: recorrente.ativa,
          observacoes: recorrente.observacoes ?? undefined,
        }}
        onSubmit={action}
        submitLabel="Salvar alterações"
        fornecedores={fornecedores}
        categorias={categorias ?? []}
      />
    </div>
  )
}
