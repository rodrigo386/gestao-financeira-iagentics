import { redirect } from 'next/navigation'
import { criarPJSpot } from '@/modules/folha/pj-spot'
import { PJSpotForm, PJSpotFormData } from '@/components/forms/pj-spot-form'

export default function NovoPJSpotPage() {
  async function action(formData: PJSpotFormData) {
    'use server'
    const pj = await criarPJSpot({
      nome: formData.nome,
      cpf_cnpj: formData.cpf_cnpj?.trim() || undefined,
      especialidade: formData.especialidade?.trim() || undefined,
      contato_email: formData.contato_email?.trim() || undefined,
      contato_telefone: formData.contato_telefone?.trim() || undefined,
      valor_hora_padrao: formData.valor_hora_padrao,
      ativo: formData.ativo,
    })
    redirect(`/folha/pj-spot/${pj.id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Novo PJ Spot</h1>
      <PJSpotForm onSubmit={action} submitLabel="Criar prestador" />
    </div>
  )
}
