import Link from 'next/link'
import { listarRecorrentes } from '@/modules/despesas/recorrentes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function RecorrentesPage() {
  const recorrentes = await listarRecorrentes()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Despesas recorrentes</h1>
          <p className="text-sm text-muted-foreground">{recorrentes.length} recorrente(s) cadastradas</p>
        </div>
        <Link href="/despesas/recorrentes/novo">
          <Button>Nova recorrente</Button>
        </Link>
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Dia</th>
              <th className="px-4 py-3">Próx. geração</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {recorrentes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhuma despesa recorrente cadastrada ainda.
                </td>
              </tr>
            ) : recorrentes.map((r) => {
              const row = r as typeof r & { fornecedor?: { nome: string } | null }
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.descricao}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.fornecedor?.nome ?? '—'}</td>
                  <td className="px-4 py-3">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3">{r.dia_mes}</td>
                  <td className="px-4 py-3">{r.proxima_geracao}</td>
                  <td className="px-4 py-3">
                    <Badge variant={r.ativa ? 'default' : 'secondary'}>{r.ativa ? 'ativa' : 'inativa'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/despesas/recorrentes/${r.id}`} className="text-sm underline">Ver</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
