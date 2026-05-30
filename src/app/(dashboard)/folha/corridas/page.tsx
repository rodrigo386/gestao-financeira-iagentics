import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listarFolhas } from '@/modules/folha/corrida'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

function formatMesRef(mesRef: string): string {
  const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
  const parts = mesRef.split('-').map(Number)
  return `${meses[parts[1]! - 1]}/${parts[0]}`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatBRL(val: number) {
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

async function abrir(formData: FormData) {
  'use server'
  const rawMonth = formData.get('mes_ref') as string
  // browser <input type="month"> gives YYYY-MM; convert to YYYY-MM-01
  const mesRef = rawMonth.length === 7 ? `${rawMonth}-01` : rawMonth
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { abrirFolha } = await import('@/modules/folha/corrida')
  const folha = await abrirFolha(mesRef, user.id)
  redirect(`/folha/corridas/${folha.id}`)
}

type FolhaRow = {
  id: string
  mes_ref: string
  status: string
  gerada_em: string
  fechada_em: string | null
}

type ItemCountRow = {
  folha_id: string
  count: number
}

export default async function CorridasPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>
}) {
  const { ano: anoParam } = await searchParams
  const now = new Date()
  const ano = anoParam ? parseInt(anoParam, 10) : now.getFullYear()

  const folhas = (await listarFolhas({ ano })) as FolhaRow[]

  // Fetch item counts and totals per folha
  const supabase = await createClient()
  const folhaIds = folhas.map((f) => f.id)

  const itemCountsMap: Record<string, number> = {}
  const totalBrutoMap: Record<string, number> = {}

  if (folhaIds.length > 0) {
    const { data: itemsRaw } = await supabase
      .from('itens_folha')
      .select('folha_id, salario_bruto')
      .in('folha_id', folhaIds)

    const items = itemsRaw ?? []
    for (const item of items) {
      const fid = item.folha_id as string
      itemCountsMap[fid] = (itemCountsMap[fid] ?? 0) + 1
      totalBrutoMap[fid] = (totalBrutoMap[fid] ?? 0) + (item.salario_bruto as number)
    }
  }

  const anos = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Corridas de Folha</h1>
          <p className="text-sm text-muted-foreground">{folhas.length} corrida(s) em {ano}</p>
        </div>
      </div>

      {/* Year filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Ano:</span>
        {anos.map((a) => (
          <Link
            key={a}
            href={`/folha/corridas?ano=${a}`}
            className={`text-sm px-3 py-1 rounded-md border ${a === ano ? 'bg-foreground text-background' : 'border-border hover:bg-accent'}`}
          >
            {a}
          </Link>
        ))}
      </div>

      {/* Abrir nova corrida form */}
      <div className="border rounded-md p-4 bg-muted">
        <p className="text-sm font-medium mb-3">Abrir nova corrida</p>
        <form action={abrir} className="flex items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="mes_ref" className="text-xs text-muted-foreground">
              Mes de referencia
            </label>
            <input
              id="mes_ref"
              type="month"
              name="mes_ref"
              required
              defaultValue={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`}
              className="border rounded-md px-3 py-2 text-sm bg-card border-border"
            />
          </div>
          <Button type="submit">Abrir corrida</Button>
        </form>
      </div>

      {/* Table */}
      {folhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma corrida em {ano}.</p>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-4 py-3">Mes Ref.</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Gerada em</th>
                <th className="px-4 py-3">Fechada em</th>
                <th className="px-4 py-3 text-right">Itens</th>
                <th className="px-4 py-3 text-right">Total Bruto</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {folhas.map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{formatMesRef(f.mes_ref)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={f.status === 'fechada' ? 'secondary' : 'default'}>
                      {f.status === 'fechada' ? 'Fechada' : 'Aberta'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(f.gerada_em)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(f.fechada_em)}</td>
                  <td className="px-4 py-3 text-right">{itemCountsMap[f.id] ?? 0}</td>
                  <td className="px-4 py-3 text-right">{formatBRL(totalBrutoMap[f.id] ?? 0)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/folha/corridas/${f.id}`} className="text-sm text-primary underline">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
