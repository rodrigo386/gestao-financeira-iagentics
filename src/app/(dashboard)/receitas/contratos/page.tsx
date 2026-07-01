import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { listarContratos, criarContrato, atualizarContrato } from '@/modules/receitas/contratos'
import { listarClientes, criarCliente } from '@/modules/receitas/clientes'
import { Badge } from '@/components/ui/badge'
import { NovoContratoDialog } from '@/components/cadastro/novo-contrato-dialog'
import { EditarContratoDialog } from '@/components/cadastro/editar-contrato-dialog'

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

  async function criarContratoAction(input: { clienteId?: string; novoClienteNome?: string; nome: string; ticket: number; diaCobranca: number; dataInicio: string }) {
    'use server'
    let clienteId = input.clienteId
    if (!clienteId && input.novoClienteNome) {
      const c = await criarCliente({ nome: input.novoClienteNome, moeda_padrao: 'BRL' })
      clienteId = c.id
    }
    if (!clienteId) throw new Error('Selecione ou crie um cliente')
    await criarContrato({
      cliente_id: clienteId, nome: input.nome, tipo: 'mensal', ticket: input.ticket,
      moeda: 'BRL', dia_cobranca: input.diaCobranca, data_inicio: input.dataInicio, status: 'ativo',
    })
    revalidatePath('/receitas/contratos')
    revalidatePath('/')
  }

  async function editarContratoAction(id: string, patch: { nome: string; ticket: number; dia_cobranca: number; status: 'ativo' | 'pausado' | 'churned' }) {
    'use server'
    await atualizarContrato(id, patch)
    revalidatePath('/receitas/contratos')
    revalidatePath('/')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contratos</h1>
          <p className="text-sm text-muted-foreground">{contratos.length} contrato(s) cadastrados</p>
        </div>
        <NovoContratoDialog clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))} onCriar={criarContratoAction} />
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
                  <div className="flex items-center justify-end gap-2">
                    <EditarContratoDialog initial={{ id: c.id, nome: c.nome, ticket: c.ticket, dia_cobranca: c.dia_cobranca, status: c.status }} onSalvar={editarContratoAction} />
                    <Link href={`/receitas/contratos/${c.id}`} className="text-sm text-primary underline">Ver</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
