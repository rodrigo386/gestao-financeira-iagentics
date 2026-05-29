import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buscarRecorrente } from '@/modules/despesas/recorrentes'
import { Badge } from '@/components/ui/badge'

export default async function RecorrenteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const recorrente = await buscarRecorrente(id)
  if (!recorrente) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{recorrente.descricao}</h1>
        <div className="flex gap-4 text-sm text-muted-foreground mt-2 flex-wrap">
          <Badge variant={recorrente.ativa ? 'default' : 'secondary'}>{recorrente.ativa ? 'ativa' : 'inativa'}</Badge>
        </div>
      </div>

      <div className="border rounded-md p-4 space-y-3 max-w-xl text-sm">
        <div className="grid grid-cols-2 gap-2">
          <span className="text-muted-foreground">Valor</span>
          <span>R$ {recorrente.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <span className="text-muted-foreground">Moeda</span>
          <span>{recorrente.moeda}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <span className="text-muted-foreground">Dia do mês</span>
          <span>{recorrente.dia_mes}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <span className="text-muted-foreground">Data início</span>
          <span>{recorrente.data_inicio}</span>
        </div>
        {recorrente.data_fim && (
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Data fim</span>
            <span>{recorrente.data_fim}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <span className="text-muted-foreground">Próxima geração</span>
          <span>{recorrente.proxima_geracao}</span>
        </div>
        {recorrente.observacoes && (
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Observações</span>
            <span>{recorrente.observacoes}</span>
          </div>
        )}
        {recorrente.fornecedor_id && (
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Fornecedor</span>
            <Link href={`/despesas/fornecedores/${recorrente.fornecedor_id}`} className="underline">
              Ver fornecedor
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
