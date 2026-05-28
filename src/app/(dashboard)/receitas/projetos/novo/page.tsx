import { redirect } from 'next/navigation'
import { listarClientes } from '@/modules/receitas/clientes'
import { criarProjeto } from '@/modules/receitas/projetos'
import { ProjetoForm, ProjetoFormData } from '@/components/forms/projeto-form'

export default async function NovoProjetoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>
}) {
  const { cliente: clienteId } = await searchParams
  const { data: clientes } = await listarClientes({ status: 'ativo' })

  async function action(formData: ProjetoFormData) {
    'use server'
    const cleaned = {
      cliente_id: formData.cliente_id,
      nome: formData.nome,
      descricao: formData.descricao?.trim() || undefined,
      valor_total: formData.valor_total,
      moeda: formData.moeda as 'BRL' | 'USD' | 'EUR',
      data_inicio: formData.data_inicio,
      data_prevista_fim: formData.data_prevista_fim,
      status: formData.status,
      observacoes: formData.observacoes?.trim() || undefined,
    }
    const projeto = await criarProjeto(cleaned)
    redirect(`/receitas/projetos/${projeto.id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Novo projeto</h1>
      <ProjetoForm
        clientes={clientes}
        initialClienteId={clienteId}
        onSubmit={action}
        submitLabel="Criar projeto"
      />
    </div>
  )
}
