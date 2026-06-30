import { notFound, redirect } from 'next/navigation'
import { buscarContrato, atualizarContrato } from '@/modules/receitas/contratos'
import { listarClientes } from '@/modules/receitas/clientes'
import { ContratoForm, type ContratoFormData } from '@/components/forms/contrato-form'

export default async function EditarContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contrato = await buscarContrato(id)
  if (!contrato) notFound()
  const { data: clientes } = await listarClientes({ status: 'ativo' })

  async function action(formData: ContratoFormData) {
    'use server'
    await atualizarContrato(id, {
      cliente_id: formData.cliente_id,
      nome: formData.nome,
      tipo: formData.tipo,
      ticket: formData.ticket,
      moeda: formData.moeda as 'BRL' | 'USD' | 'EUR',
      dia_cobranca: formData.dia_cobranca,
      data_inicio: formData.data_inicio,
      data_fim: formData.data_fim?.trim() || undefined,
      status: formData.status,
      observacoes: formData.observacoes?.trim() || undefined,
    })
    redirect(`/receitas/contratos/${id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar contrato</h1>
      <ContratoForm
        clientes={clientes ?? []}
        initialData={{
          cliente_id: contrato.cliente_id,
          nome: contrato.nome,
          tipo: contrato.tipo,
          ticket: contrato.ticket,
          moeda: contrato.moeda,
          dia_cobranca: contrato.dia_cobranca,
          data_inicio: contrato.data_inicio,
          data_fim: contrato.data_fim ?? undefined,
          status: contrato.status,
          observacoes: contrato.observacoes ?? undefined,
        }}
        onSubmit={action}
        submitLabel="Salvar alterações"
      />
    </div>
  )
}
