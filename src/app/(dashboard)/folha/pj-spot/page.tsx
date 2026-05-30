import Link from 'next/link'
import { listarPJSpot } from '@/modules/folha/pj-spot'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

function formatBRL(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

export default async function PJSpotPage() {
  const { data, total } = await listarPJSpot({ limit: 100 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">PJ Spot</h1>
          <p className="text-sm text-muted-foreground">{total} prestador(es) cadastrados</p>
        </div>
        <Link href="/folha/pj-spot/novo">
          <Button>Novo PJ Spot</Button>
        </Link>
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Especialidade</th>
              <th className="px-4 py-3">Valor/Hora</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum prestador cadastrado ainda.
                </td>
              </tr>
            ) : data.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-3 font-medium">{p.nome}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.especialidade ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.valor_hora_padrao != null ? formatBRL(p.valor_hora_padrao) : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.contato_email ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={p.ativo ? 'default' : 'secondary'}>{p.ativo ? 'Ativo' : 'Inativo'}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/folha/pj-spot/${p.id}`} className="text-sm text-primary underline">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
