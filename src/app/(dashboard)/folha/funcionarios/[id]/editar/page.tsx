import { notFound, redirect } from 'next/navigation'
import { buscarFuncionario, atualizarFuncionario } from '@/modules/folha/funcionarios'
import { FuncionarioForm, type FuncionarioFormData } from '@/components/forms/funcionario-form'

export default async function EditarFuncionarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const funcionario = await buscarFuncionario(id)
  if (!funcionario) notFound()

  async function action(formData: FuncionarioFormData) {
    'use server'
    await atualizarFuncionario(id, {
      nome: formData.nome,
      cpf: formData.cpf?.replace(/\D/g, '') || undefined,
      cargo: formData.cargo,
      tipo: formData.tipo,
      salario_base: formData.salario_base,
      beneficios_json: formData.beneficios_json,
      encargos_pct_json: formData.encargos_pct_json,
      centro_custo: formData.centro_custo?.trim() || undefined,
      data_admissao: formData.data_admissao,
      data_desligamento: formData.data_desligamento?.trim() || undefined,
      chave_pix: formData.chave_pix?.trim() || undefined,
      ativo: formData.ativo,
    })
    redirect(`/folha/funcionarios/${id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar funcionário</h1>
      <FuncionarioForm
        initialData={{
          nome: funcionario.nome,
          cpf: funcionario.cpf ?? undefined,
          cargo: funcionario.cargo,
          tipo: funcionario.tipo as 'clt' | 'pj_recorrente',
          salario_base: funcionario.salario_base,
          beneficios_json: funcionario.beneficios_json as FuncionarioFormData['beneficios_json'],
          encargos_pct_json: funcionario.encargos_pct_json as FuncionarioFormData['encargos_pct_json'],
          centro_custo: funcionario.centro_custo ?? undefined,
          data_admissao: funcionario.data_admissao,
          data_desligamento: funcionario.data_desligamento ?? undefined,
          chave_pix: funcionario.chave_pix ?? undefined,
          ativo: funcionario.ativo,
        }}
        onSubmit={action}
        submitLabel="Salvar alterações"
      />
    </div>
  )
}
