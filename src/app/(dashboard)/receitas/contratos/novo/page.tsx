import { redirect } from 'next/navigation'
import { listarClientes } from '@/modules/receitas/clientes'
import { criarContrato } from '@/modules/receitas/contratos'
import { ContratoForm, ContratoFormData } from '@/components/forms/contrato-form'

export default async function NovoContratoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>
}) {
  const { cliente: clienteId } = await searchParams
  const { data: clientes } = await listarClientes({ status: 'ativo' })

  async function action(formData: ContratoFormData) {
    'use server'
    const cleaned = {
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
    }
    const contrato = await criarContrato(cleaned)
    redirect(`/receitas/contratos/${contrato.id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Novo contrato</h1>
      <ContratoForm
        clientes={clientes}
        initialClienteId={clienteId}
        onSubmit={action}
        submitLabel="Criar contrato"
      />
    </div>
  )
}
