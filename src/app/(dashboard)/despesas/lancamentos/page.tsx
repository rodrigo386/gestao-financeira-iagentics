import Link from 'next/link'
import { listarLancamentos } from '@/modules/despesas/lancamentos'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

function dataMenos30d(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatMoney(v: number, tipo: string): string {
  const f = `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  return tipo === 'entrada' ? `+ ${f}` : `- ${f}`
}

export default async function LancamentosPage() {
  const de = dataMenos30d()
  const ate = hoje()

  const supabase = await createClient()
  const [lancamentos, { data: contas }, { data: categorias }, { data: fornecedores }, { data: clientes }] = await Promise.all([
    listarLancamentos({ data_de: de, data_ate: ate }),
    supabase.from('contas_bancarias').select('id, banco, conta'),
    supabase.from('categorias').select('id, nome'),
    supabase.from('fornecedores').select('id, nome'),
    supabase.from('clientes').select('id, nome'),
  ])

  const contaMap = new Map((contas ?? []).map((c: { id: string; banco: string; conta?: string | null }) => [c.id, `${c.banco}${c.conta ? ` · ${c.conta}` : ''}`]))
  const categoriaMap = new Map((categorias ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]))
  const fornecedorMap = new Map((fornecedores ?? []).map((f: { id: string; nome: string }) => [f.id, f.nome]))
  const clienteMap = new Map((clientes ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Lançamentos</h1>
          <p className="text-sm text-neutral-500">Últimos 30 dias ({de} → {ate})</p>
        </div>
        <Link href="/despesas/lancamentos/novo">
          <Button>Novo lançamento</Button>
        </Link>
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-left">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Fornecedor / Cliente</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Conta</th>
            </tr>
          </thead>
          <tbody>
            {lancamentos.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Nenhum lançamento no período.
                </td>
              </tr>
            ) : lancamentos.map((l) => {
              const parte = l.fornecedor_id
                ? fornecedorMap.get(l.fornecedor_id)
                : l.cliente_id
                  ? clienteMap.get(l.cliente_id)
                  : undefined
              return (
                <tr key={l.id} className="border-t">
                  <td className="px-4 py-3 text-neutral-600">{l.data}</td>
                  <td className="px-4 py-3 font-medium">{l.descricao}</td>
                  <td className="px-4 py-3 text-neutral-600">{parte ?? '—'}</td>
                  <td className="px-4 py-3 text-neutral-600">{l.categoria_id ? (categoriaMap.get(l.categoria_id) ?? '—') : '—'}</td>
                  <td className={`px-4 py-3 text-right font-medium ${l.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                    {formatMoney(l.valor, l.tipo)}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{l.conta_id ? (contaMap.get(l.conta_id) ?? '—') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
