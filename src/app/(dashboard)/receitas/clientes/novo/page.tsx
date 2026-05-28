import { redirect } from 'next/navigation'
import { criarCliente } from '@/modules/receitas/clientes'
import { ClienteForm } from '@/components/forms/cliente-form'

export default function NovoClientePage() {
  async function action(formData: { nome: string; cnpj?: string; segmento?: string; contato_email?: string; contato_telefone?: string; observacoes?: string }) {
    'use server'
    const cleaned = {
      nome: formData.nome,
      cnpj: formData.cnpj?.trim() || undefined,
      segmento: formData.segmento?.trim() || undefined,
      contato_email: formData.contato_email?.trim() || undefined,
      contato_telefone: formData.contato_telefone?.trim() || undefined,
      observacoes: formData.observacoes?.trim() || undefined,
    }
    const cliente = await criarCliente(cleaned)
    redirect(`/receitas/clientes/${cliente.id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Novo cliente</h1>
      <ClienteForm onSubmit={action} submitLabel="Criar cliente" />
    </div>
  )
}
