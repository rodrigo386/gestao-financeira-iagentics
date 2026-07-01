'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type NovoLancamentoInput = {
  tipo: 'entrada' | 'saida'
  valor: number
  descricao: string
  contaId: string
  data: string
  categoriaId?: string
}

export function NovoLancamentoDialog({ tipo, contas, categorias, onCriar }: {
  tipo: 'entrada' | 'saida'
  contas: { id: string; banco: string }[]
  categorias: { id: string; nome: string }[]
  onCriar: (data: NovoLancamentoInput) => Promise<void>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [contaId, setContaId] = useState(contas[0]?.id ?? '')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoriaId, setCategoriaId] = useState('')
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const isEntrada = tipo === 'entrada'
  const podeSalvar = Number(valor) > 0 && descricao.trim() !== '' && contaId !== ''

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onCriar({ tipo, valor: Number(valor), descricao: descricao.trim(), contaId, data, categoriaId: categoriaId || undefined })
        setOpen(false); setValor(''); setDescricao(''); setCategoriaId('')
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <>
      <Button variant={isEntrada ? 'default' : 'outline'} onClick={() => setOpen(true)}>
        {isEntrada ? '+ Entrada' : '+ Saída'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isEntrada ? 'Nova entrada' : 'Nova saída'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="nl-valor">Valor (R$) *</Label>
                <Input id="nl-valor" type="number" min="0.01" step="0.01" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nl-data">Data *</Label>
                <Input id="nl-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nl-desc">Descrição *</Label>
              <Input id="nl-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)}
                placeholder={isEntrada ? 'Ex.: Recebimento avulso' : 'Ex.: Almoço, material'} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nl-conta">Conta *</Label>
              <select id="nl-conta" className="w-full border border-border rounded-md px-2 py-2 text-sm bg-background"
                value={contaId} onChange={(e) => setContaId(e.target.value)}>
                <option value="">— Selecione —</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.banco}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nl-cat">Categoria (opcional)</Label>
              <select id="nl-cat" className="w-full border border-border rounded-md px-2 py-2 text-sm bg-background"
                value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">— Nenhuma —</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
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
