import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { listarRecorrentes, criarRecorrente, atualizarRecorrente } from '@/modules/despesas/recorrentes'
import { listarFornecedores, criarFornecedor } from '@/modules/despesas/fornecedores'
import { Badge } from '@/components/ui/badge'
import { NovaRecorrenteDialog } from '@/components/cadastro/nova-recorrente-dialog'
import { EditarRecorrenteDialog } from '@/components/cadastro/editar-recorrente-dialog'

export default async function RecorrentesPage() {
  const [recorrentes, fornecedores] = await Promise.all([
    listarRecorrentes(),
    listarFornecedores({ ativo: true }),
  ])

  async function criarRecorrenteAction(input: { descricao: string; valor: number; diaMes: number; fornecedorId?: string; novoFornecedorNome?: string }) {
    'use server'
    let fornecedorId = input.fornecedorId
    if (!fornecedorId && input.novoFornecedorNome) {
      const f = await criarFornecedor({ nome: input.novoFornecedorNome })
      fornecedorId = f.id
    }
    if (!fornecedorId) throw new Error('Selecione ou crie um fornecedor')
    const hoje = new Date().toISOString().slice(0, 10)
    await criarRecorrente({
      fornecedor_id: fornecedorId, descricao: input.descricao, valor: input.valor, moeda: 'BRL',
      dia_mes: input.diaMes, data_inicio: hoje, proxima_geracao: `${hoje.slice(0, 7)}-01`,
    })
    revalidatePath('/despesas/recorrentes')
    revalidatePath('/')
  }

  async function editarRecorrenteAction(id: string, patch: { descricao: string; valor: number; dia_mes: number; ativa: boolean }) {
    'use server'
    await atualizarRecorrente(id, patch)
    revalidatePath('/despesas/recorrentes')
    revalidatePath('/')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Despesas recorrentes</h1>
          <p className="text-sm text-muted-foreground">{recorrentes.length} recorrente(s) cadastradas</p>
        </div>
        <NovaRecorrenteDialog fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))} onCriar={criarRecorrenteAction} />
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
                    <div className="flex items-center justify-end gap-2">
                      <EditarRecorrenteDialog initial={{ id: r.id, descricao: r.descricao, valor: r.valor, dia_mes: r.dia_mes, ativa: r.ativa }} onSalvar={editarRecorrenteAction} />
                      <Link href={`/despesas/recorrentes/${r.id}`} className="text-sm text-primary underline">Ver</Link>
                    </div>
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
