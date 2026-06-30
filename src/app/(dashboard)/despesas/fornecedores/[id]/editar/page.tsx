import { notFound, redirect } from 'next/navigation'
import { buscarFornecedor, atualizarFornecedor } from '@/modules/despesas/fornecedores'
import { createClient } from '@/lib/supabase/server'
import { FornecedorForm, type FornecedorFormData } from '@/components/forms/fornecedor-form'

export default async function EditarFornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fornecedor = await buscarFornecedor(id)
  if (!fornecedor) notFound()

  const supabase = await createClient()
  const { data: categorias } = await supabase
    .from('categorias').select('id, nome').eq('tipo', 'despesa').eq('ativa', true).order('nome')

  async function action(formData: FornecedorFormData) {
    'use server'
    await atualizarFornecedor(id, {
      nome: formData.nome,
      cnpj: formData.cnpj?.trim() || undefined,
      categoria_default_id: formData.categoria_default_id?.trim() || undefined,
      contato_email: formData.contato_email?.trim() || undefined,
      contato_telefone: formData.contato_telefone?.trim() || undefined,
      observacoes: formData.observacoes?.trim() || undefined,
      ativo: formData.ativo,
    })
    redirect(`/despesas/fornecedores/${id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar fornecedor</h1>
      <FornecedorForm
        categorias={categorias ?? []}
        initialData={{
          nome: fornecedor.nome,
          cnpj: fornecedor.cnpj ?? undefined,
          categoria_default_id: fornecedor.categoria_default_id ?? undefined,
          contato_email: fornecedor.contato_email ?? undefined,
          contato_telefone: fornecedor.contato_telefone ?? undefined,
          observacoes: fornecedor.observacoes ?? undefined,
          ativo: fornecedor.ativo,
        }}
        onSubmit={action}
        submitLabel="Salvar alterações"
      />
    </div>
  )
}
