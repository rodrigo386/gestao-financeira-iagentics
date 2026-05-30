import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buscarFornecedor } from '@/modules/despesas/fornecedores'
import { listarRecorrentes } from '@/modules/despesas/recorrentes'
import { Badge } from '@/components/ui/badge'

export default async function FornecedorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fornecedor = await buscarFornecedor(id)
  if (!fornecedor) notFound()

  const recorrentes = await listarRecorrentes({ fornecedor_id: id })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{fornecedor.nome}</h1>
        <div className="flex gap-4 text-sm text-muted-foreground mt-2 flex-wrap">
          {fornecedor.cnpj && <span>CNPJ: {fornecedor.cnpj}</span>}
          <Badge variant={fornecedor.ativo ? 'default' : 'secondary'}>{fornecedor.ativo ? 'ativo' : 'inativo'}</Badge>
        </div>
        {fornecedor.contato_email && <p className="mt-2 text-sm">Email: {fornecedor.contato_email}</p>}
        {fornecedor.contato_telefone && <p className="text-sm">Telefone: {fornecedor.contato_telefone}</p>}
        {fornecedor.observacoes && <p className="mt-2 text-sm text-muted-foreground">{fornecedor.observacoes}</p>}
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Despesas recorrentes ({recorrentes.length})</h2>
          <Link href={`/despesas/recorrentes/novo?fornecedor=${id}`} className="text-sm text-primary underline">+ Nova recorrente</Link>
        </div>
        {recorrentes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma despesa recorrente vinculada.</p>
        ) : (
          <div className="border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Dia</th>
                  <th className="px-4 py-3">Próx. geração</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {recorrentes.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{r.descricao}</td>
                    <td className="px-4 py-3">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3">{r.dia_mes}</td>
                    <td className="px-4 py-3">{r.proxima_geracao}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.ativa ? 'default' : 'secondary'}>{r.ativa ? 'ativa' : 'inativa'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/despesas/recorrentes/${r.id}`} className="text-sm text-primary underline">Ver</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
