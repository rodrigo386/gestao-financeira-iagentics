import { redirect } from 'next/navigation'
import { criarFornecedor } from '@/modules/despesas/fornecedores'
import { createClient } from '@/lib/supabase/server'
import { FornecedorForm } from '@/components/forms/fornecedor-form'

export default async function NovoFornecedorPage() {
  const supabase = await createClient()
  const { data: categorias } = await supabase
    .from('categorias').select('id, nome').eq('tipo', 'despesa').eq('ativa', true).order('nome')

  async function action(formData: {
    nome: string
    cnpj?: string
    categoria_default_id?: string
    contato_email?: string
    contato_telefone?: string
    observacoes?: string
    ativo: boolean
  }) {
    'use server'
    const cleaned = {
      nome: formData.nome,
      cnpj: formData.cnpj?.trim() || undefined,
      categoria_default_id: formData.categoria_default_id?.trim() || undefined,
      contato_email: formData.contato_email?.trim() || undefined,
      contato_telefone: formData.contato_telefone?.trim() || undefined,
      observacoes: formData.observacoes?.trim() || undefined,
      ativo: formData.ativo,
    }
    const fornecedor = await criarFornecedor(cleaned)
    redirect(`/despesas/fornecedores/${fornecedor.id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Novo fornecedor</h1>
      <FornecedorForm onSubmit={action} submitLabel="Criar fornecedor" categorias={categorias ?? []} />
    </div>
  )
}
