'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ReceberInput = { dataRecebimento: string; contaId: string; categoriaId?: string }
type Conta = { id: string; banco: string }
type Categoria = { id: string; nome: string }

function hojeISO() { return new Date().toISOString().slice(0, 10) }

export function ARReceberDialog({
  arId, contas, categorias, onReceber,
}: {
  arId: string
  contas: Conta[]
  categorias: Categoria[]
  onReceber: (id: string, input: ReceberInput) => Promise<void>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(hojeISO())
  const [contaId, setContaId] = useState(contas[0]?.id ?? '')
  const [categoriaId, setCategoriaId] = useState('')
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function receber() {
    setErr(null)
    if (!contaId) { setErr('Selecione a conta bancária do recebimento.'); return }
    start(async () => {
      try {
        await onReceber(arId, { dataRecebimento: data, contaId, categoriaId: categoriaId || undefined })
        setOpen(false)
        router.refresh()
      } catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao receber') }
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Receber</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Marcar como recebido</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="rc-data">Data do recebimento</Label>
              <Input id="rc-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rc-conta">Conta bancária *</Label>
              <select id="rc-conta" className="w-full border border-border rounded-md px-2 py-1 text-sm bg-background"
                value={contaId} onChange={(e) => setContaId(e.target.value)}>
                <option value="">— selecione —</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.banco}</option>)}
              </select>
              {contas.length === 0 && (
                <p className="text-xs text-amber-400">Nenhuma conta ativa. Cadastre em Configurações → Contas Bancárias.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="rc-cat">Categoria de receita (opcional)</Label>
              <select id="rc-cat" className="w-full border border-border rounded-md px-2 py-1 text-sm bg-background"
                value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">— sem categoria —</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button onClick={receber} disabled={pending || contas.length === 0}>{pending ? 'Salvando...' : 'Confirmar recebimento'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
