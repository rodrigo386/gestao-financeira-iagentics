'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ARPatch = { data_emissao?: string; data_vencimento?: string; valor?: number; status?: string }
type Row = { id: string; data_emissao: string; data_vencimento: string; valor: number; status: string }

const STATUS_EDIT = ['previsto', 'emitido', 'atrasado', 'cancelado'] as const

export function AREditDialog({ row, onSalvar }: { row: Row; onSalvar: (id: string, patch: ARPatch) => Promise<void> }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [emissao, setEmissao] = useState(row.data_emissao)
  const [vencimento, setVencimento] = useState(row.data_vencimento)
  const [valor, setValor] = useState(String(row.valor))
  const [status, setStatus] = useState(row.status)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  if (row.status === 'recebido') {
    return <Button variant="outline" size="sm" disabled title="AR recebida não pode ser editada">Editar</Button>
  }

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onSalvar(row.id, {
          data_emissao: emissao,
          data_vencimento: vencimento,
          valor: Number(valor),
          status,
        })
        setOpen(false)
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Editar</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar conta a receber</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ar-emissao">Emissão</Label>
              <Input id="ar-emissao" type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ar-venc">Vencimento</Label>
              <Input id="ar-venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ar-valor">Valor (R$)</Label>
              <Input id="ar-valor" type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ar-status">Status</Label>
              <select id="ar-status" className="w-full border border-border rounded-md px-2 py-1 text-sm bg-background"
                value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_EDIT.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>{pending ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
