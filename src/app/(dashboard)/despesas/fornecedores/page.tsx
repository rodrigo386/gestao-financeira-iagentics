import Link from 'next/link'
import { listarFornecedores } from '@/modules/despesas/fornecedores'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function FornecedoresPage() {
  const supabase = await createClient()
  const [fornecedores, { data: categorias }] = await Promise.all([
    listarFornecedores(),
    supabase.from('categorias').select('id, nome').eq('tipo', 'despesa').eq('ativa', true).order('nome'),
  ])

  const categoriaMap = new Map((categorias ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fornecedores</h1>
          <p className="text-sm text-neutral-500">{fornecedores.length} fornecedor(es) cadastrados</p>
        </div>
        <Link href="/despesas/fornecedores/novo">
          <Button>Novo fornecedor</Button>
        </Link>
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-left">
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
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  Nenhum fornecedor cadastrado ainda.
                </td>
              </tr>
            ) : fornecedores.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="px-4 py-3 font-medium">{f.nome}</td>
                <td className="px-4 py-3 text-neutral-600">{f.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {f.categoria_default_id ? (categoriaMap.get(f.categoria_default_id) ?? '—') : '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={f.ativo ? 'default' : 'secondary'}>{f.ativo ? 'ativo' : 'inativo'}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/despesas/fornecedores/${f.id}`} className="text-sm underline">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
