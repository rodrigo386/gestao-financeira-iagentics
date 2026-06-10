'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type ContaRow = {
  id: string; banco: string; agencia: string | null; conta: string | null
  tipo: string; saldo_atual: number; ativa: boolean
}
export type NovaConta = { banco: string; agencia?: string; conta?: string; tipo: 'cc' | 'poupanca' | 'investimento'; saldo_atual: number; ativa: boolean }
export type ContaPatch = Partial<NovaConta>

const TIPOS = ['cc', 'poupanca', 'investimento'] as const

function brl(v: number) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }

export function ContasBancariasAdmin({
  contas, onCriar, onAtualizar,
}: {
  contas: ContaRow[]
  onCriar: (input: NovaConta) => Promise<void>
  onAtualizar: (id: string, patch: ContaPatch) => Promise<void>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  // form de criação
  const [banco, setBanco] = useState('')
  const [agencia, setAgencia] = useState('')
  const [conta, setConta] = useState('')
  const [tipo, setTipo] = useState('cc')
  const [saldo, setSaldo] = useState('0')

  function criar(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    start(async () => {
      try {
        await onCriar({ banco, agencia: agencia || undefined, conta: conta || undefined, tipo: tipo as NovaConta['tipo'], saldo_atual: Number(saldo), ativa: true })
        setBanco(''); setAgencia(''); setConta(''); setTipo('cc'); setSaldo('0')
        router.refresh()
      } catch (e) { setErr(e instanceof Error ? e.message : 'Erro') }
    })
  }

  return (
    <div className="space-y-6">
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Nova conta bancária</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={criar} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="cb-banco">Banco *</Label>
                <Input id="cb-banco" required value={banco} onChange={(e) => setBanco(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cb-tipo">Tipo</Label>
                <select id="cb-tipo" className="w-full border border-border rounded-md px-2 py-1 text-sm bg-background"
                  value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cb-ag">Agência</Label>
                <Input id="cb-ag" value={agencia} onChange={(e) => setAgencia(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cb-conta">Conta</Label>
                <Input id="cb-conta" value={conta} onChange={(e) => setConta(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cb-saldo">Saldo atual (R$)</Label>
                <Input id="cb-saldo" type="number" step="0.01" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
              </div>
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" disabled={pending}>{pending ? 'Salvando...' : 'Criar conta'}</Button>
          </form>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Banco</TableHead>
            <TableHead>Ag./Conta</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead>Ativa</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contas.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.banco}</TableCell>
              <TableCell className="text-muted-foreground">{[c.agencia, c.conta].filter(Boolean).join(' / ') || '—'}</TableCell>
              <TableCell>{c.tipo}</TableCell>
              <TableCell className="text-right">R$ {brl(Number(c.saldo_atual))}</TableCell>
              <TableCell>{c.ativa ? 'sim' : 'não'}</TableCell>
              <TableCell className="text-right">
                <EditarContaDialog conta={c} onAtualizar={onAtualizar} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function EditarContaDialog({ conta, onAtualizar }: { conta: ContaRow; onAtualizar: (id: string, patch: ContaPatch) => Promise<void> }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [banco, setBanco] = useState(conta.banco)
  const [agencia, setAgencia] = useState(conta.agencia ?? '')
  const [contaNum, setContaNum] = useState(conta.conta ?? '')
  const [tipo, setTipo] = useState(conta.tipo)
  const [saldo, setSaldo] = useState(String(conta.saldo_atual))
  const [ativa, setAtiva] = useState(conta.ativa)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onAtualizar(conta.id, { banco, agencia: agencia || undefined, conta: contaNum || undefined, tipo: tipo as NovaConta['tipo'], saldo_atual: Number(saldo), ativa })
        setOpen(false)
        router.refresh()
      } catch (e) { setErr(e instanceof Error ? e.message : 'Erro') }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Editar</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar conta bancária</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="ec-banco">Banco</Label>
              <Input id="ec-banco" value={banco} onChange={(e) => setBanco(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="ec-ag">Agência</Label>
                <Input id="ec-ag" value={agencia} onChange={(e) => setAgencia(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="ec-conta">Conta</Label>
                <Input id="ec-conta" value={contaNum} onChange={(e) => setContaNum(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="ec-tipo">Tipo</Label>
                <select id="ec-tipo" className="w-full border border-border rounded-md px-2 py-1 text-sm bg-background"
                  value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div className="space-y-1"><Label htmlFor="ec-saldo">Saldo (R$)</Label>
                <Input id="ec-saldo" type="number" step="0.01" value={saldo} onChange={(e) => setSaldo(e.target.value)} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="h-4 w-4" />
              Conta ativa (entra no caixa)
            </label>
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
