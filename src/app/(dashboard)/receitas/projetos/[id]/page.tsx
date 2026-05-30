import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { buscarProjeto, listarMilestones, criarMilestone } from '@/modules/receitas/projetos'
import { buscarCliente } from '@/modules/receitas/clientes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function badgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'ativo' || status === 'concluido' || status === 'pago') return 'default'
  if (status === 'cancelado') return 'destructive'
  return 'secondary'
}

function milestoneBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'concluido' || status === 'faturado' || status === 'pago') return 'default'
  return 'secondary'
}

export default async function ProjetoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projeto = await buscarProjeto(id)
  if (!projeto) notFound()

  const [cliente, milestones] = await Promise.all([
    buscarCliente(projeto.cliente_id),
    listarMilestones(id),
  ])

  async function addMilestone(formData: FormData) {
    'use server'
    const ordem = parseInt(formData.get('ordem') as string)
    const descricao = (formData.get('descricao') as string).trim()
    const valor = parseFloat(formData.get('valor') as string) || 0
    const data_prevista = formData.get('data_prevista') as string
    await criarMilestone({ projeto_id: id, ordem, descricao, valor, data_prevista })
    revalidatePath(`/receitas/projetos/${id}`)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{projeto.nome}</h1>
          <Badge variant={badgeVariant(projeto.status)}>{projeto.status}</Badge>
        </div>
        {cliente && (
          <p className="mt-1 text-sm text-muted-foreground">
            Cliente:{' '}
            <Link href={`/receitas/clientes/${cliente.id}`} className="text-primary underline">
              {cliente.nome}
            </Link>
          </p>
        )}
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-6 max-w-2xl text-sm">
        <div>
          <p className="text-muted-foreground">Valor total</p>
          <p className="font-medium">
            R$ {projeto.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Moeda</p>
          <p className="font-medium">{projeto.moeda}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Data início</p>
          <p className="font-medium">{projeto.data_inicio}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Previsão de fim</p>
          <p className="font-medium">{projeto.data_prevista_fim}</p>
        </div>
        {projeto.data_real_fim && (
          <div>
            <p className="text-muted-foreground">Conclusão real</p>
            <p className="font-medium">{projeto.data_real_fim}</p>
          </div>
        )}
        {projeto.descricao && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Descrição</p>
            <p className="font-medium">{projeto.descricao}</p>
          </div>
        )}
        {projeto.observacoes && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Observações</p>
            <p className="font-medium">{projeto.observacoes}</p>
          </div>
        )}
      </div>

      {/* Milestones */}
      <section>
        <h2 className="text-lg font-medium mb-3">Milestones ({milestones.length})</h2>

        <div className="border rounded-md mb-6">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-4 py-3">Ordem</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Data prevista</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {milestones.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Nenhum milestone ainda.
                  </td>
                </tr>
              ) : milestones.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-3 text-muted-foreground">{m.ordem}</td>
                  <td className="px-4 py-3 font-medium">{m.descricao}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    R$ {m.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.data_prevista}</td>
                  <td className="px-4 py-3">
                    <Badge variant={milestoneBadgeVariant(m.status)}>{m.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add milestone form */}
        <div className="border rounded-md p-4 max-w-2xl">
          <h3 className="text-sm font-medium mb-3">Adicionar milestone</h3>
          <form action={addMilestone} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ordem">Ordem</Label>
                <Input
                  id="ordem"
                  name="ordem"
                  type="number"
                  min={1}
                  defaultValue={milestones.length + 1}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valor">Valor (R$)</Label>
                <Input
                  id="valor"
                  name="valor"
                  type="number"
                  min={0}
                  step={0.01}
                  defaultValue={0}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição *</Label>
              <Input id="descricao" name="descricao" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_prevista">Data prevista *</Label>
              <Input id="data_prevista" name="data_prevista" type="date" required />
            </div>
            <Button type="submit">Adicionar milestone</Button>
          </form>
        </div>
      </section>
    </div>
  )
}
