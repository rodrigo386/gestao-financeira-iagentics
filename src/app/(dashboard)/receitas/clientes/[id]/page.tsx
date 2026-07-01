import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buscarCliente } from '@/modules/receitas/clientes'
import { listarContratos } from '@/modules/receitas/contratos'
import { Badge } from '@/components/ui/badge'

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cliente = await buscarCliente(id)
  if (!cliente) notFound()
  const contratos = await listarContratos({ cliente_id: id })

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{cliente.nome}</h1>
          <Link
            href={`/receitas/clientes/${id}/editar`}
            className="ml-auto rounded-md border border-border px-3 py-1.5 text-sm text-primary hover:bg-accent"
          >
            Editar cliente
          </Link>
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground mt-2">
          {cliente.cnpj && <span>CNPJ: {cliente.cnpj}</span>}
          {cliente.segmento && <span>Segmento: {cliente.segmento}</span>}
          <Badge variant={cliente.status === 'ativo' ? 'default' : 'secondary'}>{cliente.status}</Badge>
        </div>
        {cliente.contato_email && <p className="mt-2 text-sm">Email: {cliente.contato_email}</p>}
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Contratos ({contratos.length})</h2>
          <Link href={`/receitas/contratos/novo?cliente=${id}`} className="text-sm text-primary underline">+ Novo contrato</Link>
        </div>
        {contratos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem contratos.</p>
        ) : (
          <ul className="space-y-2">
            {contratos.map((c) => (
              <li key={c.id} className="border rounded-md p-3">
                <div className="flex justify-between">
                  <div>
                    <Link href={`/receitas/contratos/${c.id}`} className="font-medium text-primary underline">{c.nome}</Link>
                    <div className="text-xs text-muted-foreground">{c.tipo} · R$ {c.ticket} · desde {c.data_inicio}</div>
                  </div>
                  <Badge variant={c.status === 'ativo' ? 'default' : 'secondary'}>{c.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
