import Link from 'next/link'
import { listarProjetos } from '@/modules/receitas/projetos'
import { listarClientes } from '@/modules/receitas/clientes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

function badgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'ativo' || status === 'concluido') return 'default'
  if (status === 'cancelado') return 'destructive'
  return 'secondary'
}

export default async function ProjetosPage() {
  const [projetos, { data: clientes }] = await Promise.all([
    listarProjetos(),
    listarClientes({ limit: 500 }),
  ])

  const clienteMap = new Map(clientes.map((c) => [c.id, c.nome]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projetos</h1>
          <p className="text-sm text-muted-foreground">{projetos.length} projeto(s) cadastrados</p>
        </div>
        <Link href="/receitas/projetos/novo">
          <Button>Novo projeto</Button>
        </Link>
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Valor total</th>
              <th className="px-4 py-3">Início</th>
              <th className="px-4 py-3">Prazo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {projetos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum projeto cadastrado ainda.
                </td>
              </tr>
            ) : projetos.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-3 text-muted-foreground">{clienteMap.get(p.cliente_id) ?? '—'}</td>
                <td className="px-4 py-3 font-medium">{p.nome}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  R$ {p.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.data_inicio}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.data_prevista_fim}</td>
                <td className="px-4 py-3">
                  <Badge variant={badgeVariant(p.status)}>{p.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/receitas/projetos/${p.id}`} className="text-sm underline">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
