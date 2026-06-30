import { notFound, redirect } from 'next/navigation'
import { buscarPJSpot, atualizarPJSpot } from '@/modules/folha/pj-spot'
import { PJSpotForm, type PJSpotFormData } from '@/components/forms/pj-spot-form'

export default async function EditarPJSpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pj = await buscarPJSpot(id)
  if (!pj) notFound()

  async function action(formData: PJSpotFormData) {
    'use server'
    await atualizarPJSpot(id, {
      nome: formData.nome,
      cpf_cnpj: formData.cpf_cnpj?.trim() || undefined,
      especialidade: formData.especialidade?.trim() || undefined,
      contato_email: formData.contato_email?.trim() || undefined,
      contato_telefone: formData.contato_telefone?.trim() || undefined,
      valor_hora_padrao: formData.valor_hora_padrao,
      ativo: formData.ativo,
    })
    redirect(`/folha/pj-spot/${id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar prestador</h1>
      <PJSpotForm
        initialData={{
          nome: pj.nome,
          cpf_cnpj: pj.cpf_cnpj ?? undefined,
          especialidade: pj.especialidade ?? undefined,
          contato_email: pj.contato_email ?? undefined,
          contato_telefone: pj.contato_telefone ?? undefined,
          valor_hora_padrao: pj.valor_hora_padrao ?? undefined,
          ativo: pj.ativo,
        }}
        onSubmit={action}
        submitLabel="Salvar alterações"
      />
    </div>
  )
}
