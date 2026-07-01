'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type NovoContratoInput = {
  clienteId?: string
  novoClienteNome?: string
  nome: string
  ticket: number
  diaCobranca: number
  dataInicio: string
}

type ClienteOpt = { id: string; nome: string }

export function NovoContratoDialog({ clientes, onCriar }: {
  clientes: ClienteOpt[]
  onCriar: (data: NovoContratoInput) => Promise<void>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [clienteSel, setClienteSel] = useState(clientes[0]?.id ?? '__novo__')
  const [novoCliente, setNovoCliente] = useState('')
  const [nome, setNome] = useState('')
  const [ticket, setTicket] = useState('')
  const [dia, setDia] = useState('10')
  const [dataInicio, setDataInicio] = useState(() => new Date().toISOString().slice(0, 10))
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const isNovo = clienteSel === '__novo__'
  const clienteOk = isNovo ? !!novoCliente.trim() : !!clienteSel
  const podeSalvar = nome.trim() !== '' && Number(ticket) > 0 && clienteOk

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onCriar({
          clienteId: isNovo ? undefined : clienteSel,
          novoClienteNome: isNovo ? novoCliente.trim() : undefined,
          nome: nome.trim(),
          ticket: Number(ticket),
          diaCobranca: Number(dia),
          dataInicio,
        })
        setOpen(false); setNome(''); setTicket(''); setNovoCliente('')
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Contrato</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo contrato</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ncontr-cliente">Cliente *</Label>
              <select
                id="ncontr-cliente"
                className="w-full border border-border rounded-md px-2 py-2 text-sm bg-background"
                value={clienteSel}
                onChange={(e) => setClienteSel(e.target.value)}
              >
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                <option value="__novo__">➕ Novo cliente…</option>
              </select>
            </div>
            {isNovo && (
              <div className="space-y-1">
                <Label htmlFor="ncontr-novocliente">Nome do novo cliente *</Label>
                <Input id="ncontr-novocliente" value={novoCliente} onChange={(e) => setNovoCliente(e.target.value)} placeholder="Ex.: Prefeitura de Petrópolis" />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="ncontr-nome">Nome do contrato *</Label>
              <Input id="ncontr-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: AaaS mensal" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ncontr-valor">Valor mensal (R$) *</Label>
                <Input id="ncontr-valor" type="number" min="0.01" step="0.01" value={ticket} onChange={(e) => setTicket(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ncontr-dia">Dia de cobrança *</Label>
                <Input id="ncontr-dia" type="number" min="1" max="28" value={dia} onChange={(e) => setDia(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ncontr-inicio">Início *</Label>
              <Input id="ncontr-inicio" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
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
