import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { listarFornecedores, criarFornecedor, atualizarFornecedor } from '@/modules/despesas/fornecedores'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { NovoFornecedorDialog } from '@/components/cadastro/novo-fornecedor-dialog'
import { EditarFornecedorDialog } from '@/components/cadastro/editar-fornecedor-dialog'

export default async function FornecedoresPage() {
  const supabase = await createClient()
  const [fornecedores, { data: categorias }] = await Promise.all([
    listarFornecedores(),
    supabase.from('categorias').select('id, nome').eq('tipo', 'despesa').eq('ativa', true).order('nome'),
  ])

  const categoriaMap = new Map((categorias ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]))

  async function criarFornecedorAction(input: { nome: string; contato_email?: string }) {
    'use server'
    await criarFornecedor({ nome: input.nome, contato_email: input.contato_email })
    revalidatePath('/despesas/fornecedores')
  }

  async function editarFornecedorAction(id: string, patch: { nome: string; contato_email?: string; ativo: boolean }) {
    'use server'
    await atualizarFornecedor(id, patch)
    revalidatePath('/despesas/fornecedores')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">{fornecedores.length} fornecedor(es) cadastrados</p>
        </div>
        <NovoFornecedorDialog onCriar={criarFornecedorAction} />
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">CNPJ</th>
              <th className="px-4 py-3">Categoria padrão</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {fornecedores.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum fornecedor cadastrado ainda.
                </td>
              </tr>
            ) : fornecedores.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="px-4 py-3 font-medium">{f.nome}</td>
                <td className="px-4 py-3 text-muted-foreground">{f.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {f.categoria_default_id ? (categoriaMap.get(f.categoria_default_id) ?? '—') : '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={f.ativo ? 'default' : 'secondary'}>{f.ativo ? 'ativo' : 'inativo'}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <EditarFornecedorDialog initial={{ id: f.id, nome: f.nome, contato_email: f.contato_email, ativo: f.ativo }} onSalvar={editarFornecedorAction} />
                    <Link href={`/despesas/fornecedores/${f.id}`} className="text-sm text-primary underline">Ver</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
