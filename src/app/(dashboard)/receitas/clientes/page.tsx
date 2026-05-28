import Link from 'next/link'
import { listarClientes } from '@/modules/receitas/clientes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function ClientesPage() {
  const { data, total } = await listarClientes({ limit: 100 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-neutral-500">{total} cliente(s) cadastrados</p>
        </div>
        <Link href="/receitas/clientes/novo">
          <Button>Novo cliente</Button>
        </Link>
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-left">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">CNPJ</th>
              <th className="px-4 py-3">Segmento</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            ) : data.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3 font-medium">{c.nome}</td>
                <td className="px-4 py-3 text-neutral-600">{c.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-600">{c.segmento ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={c.status === 'ativo' ? 'default' : 'secondary'}>{c.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/receitas/clientes/${c.id}`} className="text-sm underline">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
