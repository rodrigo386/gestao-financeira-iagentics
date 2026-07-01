'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ClientePatch = { nome: string; contato_email?: string; status: 'ativo' | 'inativo' | 'churned' }

export function EditarClienteDialog({ initial, onSalvar }: {
  initial: { id: string; nome: string; contato_email?: string | null; status: string }
  onSalvar: (id: string, patch: ClientePatch) => Promise<void>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState(initial.nome)
  const [email, setEmail] = useState(initial.contato_email ?? '')
  const [status, setStatus] = useState(initial.status)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onSalvar(initial.id, { nome: nome.trim(), contato_email: email.trim() || undefined, status: status as ClientePatch['status'] })
        setOpen(false); router.refresh()
      } catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao salvar') }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Editar</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ec-nome">Nome *</Label>
              <Input id="ec-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec-email">Email</Label>
              <Input id="ec-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec-status">Status</Label>
              <select id="ec-status" className="w-full border border-border rounded-md px-2 py-2 text-sm bg-background" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ativo">ativo</option>
                <option value="inativo">inativo</option>
                <option value="churned">churned</option>
              </select>
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending || !nome.trim()}>{pending ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
