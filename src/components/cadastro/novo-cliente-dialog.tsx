'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type NovoClienteInput = { nome: string; contato_email?: string }

export function NovoClienteDialog({ onCriar }: { onCriar: (data: NovoClienteInput) => Promise<void> }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onCriar({ nome: nome.trim(), contato_email: email.trim() || undefined })
        setOpen(false); setNome(''); setEmail('')
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Cliente</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="nc-nome">Nome *</Label>
              <Input id="nc-nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Prefeitura de Petrópolis" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-email">Email (opcional)</Label>
              <Input id="nc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
