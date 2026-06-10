import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { AREditDialog, type ARPatch } from '@/components/ar-edit-dialog'
import { ARReceberDialog, type ReceberInput } from '@/components/ar-receber-dialog'

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

export function ARTable({ rows, onEditar, onMarcarRecebido, contas = [], categoriasReceita = [] }: {
  rows: ARRow[]
  onEditar?: (id: string, patch: ARPatch) => Promise<void>
  onMarcarRecebido?: (id: string, input: ReceberInput) => Promise<void>
  contas?: { id: string; banco: string }[]
  categoriasReceita?: { id: string; nome: string }[]
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma conta a receber.</p>
  }
  const total = rows.reduce((s, r) => s + (r.status !== 'cancelado' ? r.valor : 0), 0)

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        {rows.length} conta(s) · Total previsto: <strong>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
      </div>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Emissão</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Status</th>
              {(onEditar || onMarcarRecebido) && <th className="px-4 py-3 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-3">
                  <Link href={`/receitas/clientes/${r.cliente_id}`} className="text-primary underline">
                    {r.cliente?.nome ?? '—'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.origem}</td>
                <td className="px-4 py-3">{r.data_emissao}</td>
                <td className="px-4 py-3">{r.data_vencimento}</td>
                <td className="px-4 py-3 text-right">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></td>
                {(onEditar || onMarcarRecebido) && (
                  <td className="px-4 py-3 text-right space-x-2">
                    {onMarcarRecebido && r.status !== 'recebido' && r.status !== 'cancelado' && (
                      <ARReceberDialog arId={r.id} contas={contas} categorias={categoriasReceita} onReceber={onMarcarRecebido} />
                    )}
                    {onEditar && (
                      <AREditDialog
                        row={{ id: r.id, data_emissao: r.data_emissao, data_vencimento: r.data_vencimento, valor: r.valor, status: r.status }}
                        onSalvar={onEditar}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
