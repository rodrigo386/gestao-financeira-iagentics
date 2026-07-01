import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { listarClientes, criarCliente } from '@/modules/receitas/clientes'
import { Badge } from '@/components/ui/badge'
import { NovoClienteDialog } from '@/components/cadastro/novo-cliente-dialog'

export default async function ClientesPage() {
  const { data, total } = await listarClientes({ limit: 100 })

  async function criarClienteAction(input: { nome: string; contato_email?: string }) {
    'use server'
    await criarCliente({ nome: input.nome, contato_email: input.contato_email, moeda_padrao: 'BRL' })
    revalidatePath('/receitas/clientes')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">{total} cliente(s) cadastrados</p>
        </div>
        <NovoClienteDialog onCriar={criarClienteAction} />
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
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
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            ) : data.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3 font-medium">{c.nome}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.segmento ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={c.status === 'ativo' ? 'default' : 'secondary'}>{c.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/receitas/clientes/${c.id}`} className="text-sm text-primary underline">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
