'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type FornecedorPatch = { nome: string; contato_email?: string; ativo: boolean }

export function EditarFornecedorDialog({ initial, onSalvar }: {
  initial: { id: string; nome: string; contato_email?: string | null; ativo: boolean }
  onSalvar: (id: string, patch: FornecedorPatch) => Promise<void>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState(initial.nome)
  const [email, setEmail] = useState(initial.contato_email ?? '')
  const [ativo, setAtivo] = useState(initial.ativo)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onSalvar(initial.id, { nome: nome.trim(), contato_email: email.trim() || undefined, ativo })
        setOpen(false); router.refresh()
      } catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao salvar') }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Editar</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar fornecedor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ef-nome">Nome *</Label>
              <Input id="ef-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ef-email">Email</Label>
              <Input id="ef-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <input id="ef-ativo" type="checkbox" className="h-4 w-4" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
              <Label htmlFor="ef-ativo">Ativo</Label>
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
