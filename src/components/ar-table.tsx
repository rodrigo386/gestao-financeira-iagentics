import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

type ARRow = {
  id: string
  cliente: { nome: string } | null
  cliente_id: string
  origem: 'contrato' | 'milestone' | 'avulso'
  valor: number
  moeda: string
  data_emissao: string
  data_vencimento: string
  status: 'previsto' | 'emitido' | 'recebido' | 'atrasado' | 'cancelado'
}

const STATUS_VARIANT: Record<ARRow['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  previsto: 'outline',
  emitido: 'default',
  recebido: 'secondary',
  atrasado: 'destructive',
  cancelado: 'secondary',
}

export function ARTable({ rows }: { rows: ARRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">Nenhuma conta a receber.</p>
  }
  const total = rows.reduce((s, r) => s + (r.status !== 'cancelado' ? r.valor : 0), 0)

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-500">
        {rows.length} conta(s) · Total previsto: <strong>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
      </div>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-left">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Emissão</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-3">
                  <Link href={`/receitas/clientes/${r.cliente_id}`} className="underline">
                    {r.cliente?.nome ?? '—'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">{r.origem}</td>
                <td className="px-4 py-3">{r.data_emissao}</td>
                <td className="px-4 py-3">{r.data_vencimento}</td>
                <td className="px-4 py-3 text-right">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
