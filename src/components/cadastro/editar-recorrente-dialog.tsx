'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type RecorrentePatch = { descricao: string; valor: number; dia_mes: number; ativa: boolean }

export function EditarRecorrenteDialog({ initial, onSalvar }: {
  initial: { id: string; descricao: string; valor: number; dia_mes: number; ativa: boolean }
  onSalvar: (id: string, patch: RecorrentePatch) => Promise<void>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [descricao, setDescricao] = useState(initial.descricao)
  const [valor, setValor] = useState(String(initial.valor))
  const [dia, setDia] = useState(String(initial.dia_mes))
  const [ativa, setAtiva] = useState(initial.ativa)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const podeSalvar = descricao.trim() !== '' && Number(valor) > 0

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onSalvar(initial.id, { descricao: descricao.trim(), valor: Number(valor), dia_mes: Number(dia), ativa })
        setOpen(false); router.refresh()
      } catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao salvar') }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Editar</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar despesa recorrente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="er-desc">Descrição *</Label>
              <Input id="er-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="er-valor">Valor (R$) *</Label>
                <Input id="er-valor" type="number" min="0.01" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="er-dia">Dia do mês</Label>
                <Input id="er-dia" type="number" min="1" max="28" value={dia} onChange={(e) => setDia(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input id="er-ativa" type="checkbox" className="h-4 w-4" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
              <Label htmlFor="er-ativa">Ativa</Label>
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
