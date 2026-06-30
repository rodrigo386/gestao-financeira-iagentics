import { notFound, redirect } from 'next/navigation'
import { buscarCliente, atualizarCliente } from '@/modules/receitas/clientes'
import { ClienteForm, type ClienteFormData } from '@/components/forms/cliente-form'

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cliente = await buscarCliente(id)
  if (!cliente) notFound()

  async function action(formData: ClienteFormData) {
    'use server'
    await atualizarCliente(id, {
      nome: formData.nome,
      cnpj: formData.cnpj?.trim() || undefined,
      segmento: formData.segmento?.trim() || undefined,
      contato_email: formData.contato_email?.trim() || undefined,
      contato_telefone: formData.contato_telefone?.trim() || undefined,
      observacoes: formData.observacoes?.trim() || undefined,
    })
    redirect(`/receitas/clientes/${id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar cliente</h1>
      <ClienteForm
        initialData={{
          nome: cliente.nome,
          cnpj: cliente.cnpj ?? undefined,
          segmento: cliente.segmento ?? undefined,
          contato_email: cliente.contato_email ?? undefined,
          contato_telefone: cliente.contato_telefone ?? undefined,
          observacoes: cliente.observacoes ?? undefined,
        }}
        onSubmit={action}
        submitLabel="Salvar alterações"
      />
    </div>
  )
}
