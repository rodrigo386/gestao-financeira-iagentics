import { redirect } from 'next/navigation'
import { criarFuncionario } from '@/modules/folha/funcionarios'
import { FuncionarioForm, FuncionarioFormData } from '@/components/forms/funcionario-form'

export default function NovoFuncionarioPage() {
  async function action(formData: FuncionarioFormData) {
    'use server'
    const funcionario = await criarFuncionario({
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
    redirect(`/folha/funcionarios/${funcionario.id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Novo funcionário</h1>
      <FuncionarioForm onSubmit={action} submitLabel="Criar funcionário" />
    </div>
  )
}
