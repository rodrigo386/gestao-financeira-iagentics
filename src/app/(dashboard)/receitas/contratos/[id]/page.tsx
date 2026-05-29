import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buscarContrato } from '@/modules/receitas/contratos'
import { buscarCliente } from '@/modules/receitas/clientes'
import { Badge } from '@/components/ui/badge'

function badgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'ativo') return 'default'
  if (status === 'churned') return 'destructive'
  return 'secondary'
}

export default async function ContratoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contrato = await buscarContrato(id)
  if (!contrato) notFound()

  const cliente = await buscarCliente(contrato.cliente_id)

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{contrato.nome}</h1>
          <Badge variant={badgeVariant(contrato.status)}>{contrato.status}</Badge>
        </div>
        {cliente && (
          <p className="mt-1 text-sm text-muted-foreground">
            Cliente:{' '}
            <Link href={`/receitas/clientes/${cliente.id}`} className="underline">
              {cliente.nome}
            </Link>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6 max-w-2xl text-sm">
        <div>
          <p className="text-muted-foreground">Tipo</p>
          <p className="font-medium capitalize">{contrato.tipo}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Ticket</p>
          <p className="font-medium">
            R$ {contrato.ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Moeda</p>
          <p className="font-medium">{contrato.moeda}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Dia de cobrança</p>
          <p className="font-medium">{contrato.dia_cobranca}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Data início</p>
          <p className="font-medium">{contrato.data_inicio}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Data fim</p>
          <p className="font-medium">{contrato.data_fim ?? '—'}</p>
        </div>
        {contrato.motivo_churn && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Motivo churn</p>
            <p className="font-medium">{contrato.motivo_churn}</p>
          </div>
        )}
        {contrato.data_churn && (
          <div>
            <p className="text-muted-foreground">Data churn</p>
            <p className="font-medium">{contrato.data_churn}</p>
          </div>
        )}
        {contrato.observacoes && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Observações</p>
            <p className="font-medium">{contrato.observacoes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
