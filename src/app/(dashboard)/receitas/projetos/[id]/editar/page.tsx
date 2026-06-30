import { notFound, redirect } from 'next/navigation'
import { buscarProjeto, atualizarProjeto } from '@/modules/receitas/projetos'
import { listarClientes } from '@/modules/receitas/clientes'
import { ProjetoForm, type ProjetoFormData } from '@/components/forms/projeto-form'

export default async function EditarProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projeto = await buscarProjeto(id)
  if (!projeto) notFound()
  const { data: clientes } = await listarClientes({ status: 'ativo' })

  async function action(formData: ProjetoFormData) {
    'use server'
    await atualizarProjeto(id, {
      cliente_id: formData.cliente_id,
      nome: formData.nome,
      descricao: formData.descricao?.trim() || undefined,
      valor_total: formData.valor_total,
      moeda: formData.moeda as 'BRL' | 'USD' | 'EUR',
      data_inicio: formData.data_inicio,
      data_prevista_fim: formData.data_prevista_fim,
      status: formData.status,
      observacoes: formData.observacoes?.trim() || undefined,
    })
    redirect(`/receitas/projetos/${id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar projeto</h1>
      <ProjetoForm
        clientes={clientes ?? []}
        initialData={{
          cliente_id: projeto.cliente_id,
          nome: projeto.nome,
          descricao: projeto.descricao ?? undefined,
          valor_total: projeto.valor_total,
          moeda: projeto.moeda,
          data_inicio: projeto.data_inicio,
          data_prevista_fim: projeto.data_prevista_fim,
          status: projeto.status,
          observacoes: projeto.observacoes ?? undefined,
        }}
        onSubmit={action}
        submitLabel="Salvar alterações"
      />
    </div>
  )
}
