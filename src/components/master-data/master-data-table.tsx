'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { EntidadeMD } from '@/modules/master-data/registry'

function fmtCell(valor: unknown, tipo?: string): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (tipo === 'moeda') return 'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  if (tipo === 'bool') return valor ? 'sim' : 'não'
  return String(valor)
}

export function MasterDataTable({ entidade, rows, busca, onExcluir }: {
  entidade: EntidadeMD
  rows: Record<string, unknown>[]
  busca: string
  onExcluir: (key: string, id: string) => Promise<void>
}) {
  const router = useRouter()
  const [q, setQ] = useState(busca)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function buscar(e: React.FormEvent) {
    e.preventDefault()
    router.push(`/master-data?entity=${entidade.key}&q=${encodeURIComponent(q)}`)
  }

  function excluir(id: string, label: string) {
    setErr(null)
    if (!window.confirm(`Excluir "${label}"? Esta ação é permanente.`)) return
    start(async () => {
      try { await onExcluir(entidade.key, id); router.refresh() }
      catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao excluir') }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={buscar} className="flex items-end gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar por ${entidade.buscaCampo}...`} className="w-64" />
          <Button type="submit" variant="outline">Buscar</Button>
        </form>
        {entidade.novoHref && <Link href={entidade.novoHref}><Button>Novo</Button></Link>}
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            {entidade.colunas.map((c) => <TableHead key={c.campo}>{c.label}</TableHead>)}
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={entidade.colunas.length + 1} className="text-muted-foreground">Nenhum registro.</TableCell></TableRow>
          ) : rows.map((r) => {
            const id = String(r.id)
            const editarHref = entidade.editarHrefFixo ?? (entidade.editarHrefBase ? `${entidade.editarHrefBase}/${id}` : undefined)
            const label = String(r[entidade.buscaCampo] ?? id)
            return (
              <TableRow key={id}>
                {entidade.colunas.map((c) => <TableCell key={c.campo}>{fmtCell(r[c.campo], c.tipo)}</TableCell>)}
                <TableCell className="text-right space-x-3">
                  {editarHref && <Link href={editarHref} className="text-primary underline text-sm">Editar</Link>}
                  <Button variant="destructive" size="sm" disabled={pending} onClick={() => excluir(id, label)}>Excluir</Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
