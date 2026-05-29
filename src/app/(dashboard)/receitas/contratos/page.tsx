import Link from 'next/link'
import { listarContratos } from '@/modules/receitas/contratos'
import { listarClientes } from '@/modules/receitas/clientes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

function badgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'ativo') return 'default'
  if (status === 'churned') return 'destructive'
  return 'secondary'
}

export default async function ContratosPage() {
  const [contratos, { data: clientes }] = await Promise.all([
    listarContratos(),
    listarClientes({ limit: 500 }),
  ])

  const clienteMap = new Map(clientes.map((c) => [c.id, c.nome]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contratos</h1>
          <p className="text-sm text-muted-foreground">{contratos.length} contrato(s) cadastrados</p>
        </div>
        <Link href="/receitas/contratos/novo">
          <Button>Novo contrato</Button>
        </Link>
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Ticket</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {contratos.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum contrato cadastrado ainda.
                </td>
              </tr>
            ) : contratos.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3 text-muted-foreground">{clienteMap.get(c.cliente_id) ?? '—'}</td>
                <td className="px-4 py-3 font-medium">{c.nome}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.tipo}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  R$ {c.ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={badgeVariant(c.status)}>{c.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/receitas/contratos/${c.id}`} className="text-sm underline">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
