import { redirect } from 'next/navigation'
import { criarLancamento } from '@/modules/despesas/lancamentos'
import { listarFornecedores } from '@/modules/despesas/fornecedores'
import { listarClientes } from '@/modules/receitas/clientes'
import { createClient } from '@/lib/supabase/server'
import { LancamentoForm } from '@/components/forms/lancamento-form'

export default async function NovoLancamentoPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams
  const tipoInicial: 'entrada' | 'saida' | undefined =
    tipo === 'entrada' ? 'entrada' : tipo === 'saida' ? 'saida' : undefined
  const supabase = await createClient()

  const [fornecedores, { data: clientes }, { data: contas }, { data: categorias }] = await Promise.all([
    listarFornecedores({ ativo: true }),
    listarClientes({ limit: 200 }),
    supabase.from('contas_bancarias').select('id, banco, conta').eq('ativa', true).order('banco'),
    supabase.from('categorias').select('id, nome').eq('ativa', true).order('nome'),
  ])

  async function action(formData: {
    data: string
    tipo: 'entrada' | 'saida'
    conta_id: string
    valor: number
    categoria_id?: string
    fornecedor_id?: string
    cliente_id?: string
    descricao: string
    origem: 'manual'
  }) {
    'use server'
    const cleaned = {
      data: formData.data,
      tipo: formData.tipo,
      conta_id: formData.conta_id,
      valor: formData.valor,
      categoria_id: formData.categoria_id?.trim() || undefined,
      fornecedor_id: formData.fornecedor_id?.trim() || undefined,
      cliente_id: formData.cliente_id?.trim() || undefined,
      descricao: formData.descricao,
      origem: 'manual' as const,
    }
    await criarLancamento(cleaned)
    redirect('/')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Novo lançamento</h1>
      <LancamentoForm
        initialData={tipoInicial ? { tipo: tipoInicial } : undefined}
        onSubmit={action}
        submitLabel="Criar lançamento"
        contas={contas ?? []}
        categorias={categorias ?? []}
        fornecedores={fornecedores}
        clientes={clientes}
      />
    </div>
  )
}
