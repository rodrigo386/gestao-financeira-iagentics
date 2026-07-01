'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ContratoPatch = { nome: string; ticket: number; dia_cobranca: number; status: 'ativo' | 'pausado' | 'churned' }

export function EditarContratoDialog({ initial, onSalvar }: {
  initial: { id: string; nome: string; ticket: number; dia_cobranca: number; status: string }
  onSalvar: (id: string, patch: ContratoPatch) => Promise<void>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState(initial.nome)
  const [ticket, setTicket] = useState(String(initial.ticket))
  const [dia, setDia] = useState(String(initial.dia_cobranca))
  const [status, setStatus] = useState(initial.status)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const podeSalvar = nome.trim() !== '' && Number(ticket) > 0

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onSalvar(initial.id, { nome: nome.trim(), ticket: Number(ticket), dia_cobranca: Number(dia), status: status as ContratoPatch['status'] })
        setOpen(false); router.refresh()
      } catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao salvar') }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Editar</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar contrato</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="et-nome">Nome *</Label>
              <Input id="et-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="et-valor">Valor mensal (R$) *</Label>
                <Input id="et-valor" type="number" min="0.01" step="0.01" value={ticket} onChange={(e) => setTicket(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="et-dia">Dia de cobrança</Label>
                <Input id="et-dia" type="number" min="1" max="28" value={dia} onChange={(e) => setDia(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="et-status">Status</Label>
              <select id="et-status" className="w-full border border-border rounded-md px-2 py-2 text-sm bg-background" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ativo">ativo</option>
                <option value="pausado">pausado</option>
                <option value="churned">churned</option>
              </select>
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending || !podeSalvar}>{pending ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
