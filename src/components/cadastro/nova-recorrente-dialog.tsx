'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type NovaRecorrenteInput = {
  descricao: string
  valor: number
  diaMes: number
  fornecedorId?: string
  novoFornecedorNome?: string
}

type FornecedorOpt = { id: string; nome: string }

export function NovaRecorrenteDialog({ fornecedores, onCriar }: {
  fornecedores: FornecedorOpt[]
  onCriar: (data: NovaRecorrenteInput) => Promise<void>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [dia, setDia] = useState('10')
  const [fornSel, setFornSel] = useState(fornecedores[0]?.id ?? '__novo__')
  const [novoForn, setNovoForn] = useState('')
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const isNovo = fornSel === '__novo__'
  const fornOk = isNovo ? !!novoForn.trim() : !!fornSel
  const podeSalvar = descricao.trim() !== '' && Number(valor) > 0 && fornOk

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onCriar({
          descricao: descricao.trim(),
          valor: Number(valor),
          diaMes: Number(dia),
          fornecedorId: isNovo ? undefined : fornSel,
          novoFornecedorNome: isNovo ? novoForn.trim() : undefined,
        })
        setOpen(false); setDescricao(''); setValor(''); setNovoForn('')
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Despesa recorrente</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova despesa recorrente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="nrec-desc">Descrição *</Label>
              <Input id="nrec-desc" autoFocus value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Aluguel, AWS, Contador" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="nrec-valor">Valor (R$) *</Label>
                <Input id="nrec-valor" type="number" min="0.01" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nrec-dia">Dia do mês *</Label>
                <Input id="nrec-dia" type="number" min="1" max="28" value={dia} onChange={(e) => setDia(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nrec-forn">Fornecedor *</Label>
              <select
                id="nrec-forn"
                className="w-full border border-border rounded-md px-2 py-2 text-sm bg-background"
                value={fornSel}
                onChange={(e) => setFornSel(e.target.value)}
              >
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                <option value="__novo__">➕ Novo fornecedor…</option>
              </select>
            </div>
            {isNovo && (
              <div className="space-y-1">
                <Label htmlFor="nrec-novoforn">Nome do novo fornecedor *</Label>
                <Input id="nrec-novoforn" value={novoForn} onChange={(e) => setNovoForn(e.target.value)} />
              </div>
            )}
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
