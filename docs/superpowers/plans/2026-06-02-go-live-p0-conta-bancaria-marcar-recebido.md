# Go-live P0: conta bancária manual + marcar recebido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Destravar os dois fluxos diários que faltam na UI — (A) cadastrar/editar contas bancárias manualmente (com saldo, que alimenta caixa/runway) corrigindo o 404 de `/config/contas-bancarias`; (B) marcar uma Conta a Receber como recebida pela tela (cria o lançamento e abastece a DRE).

**Architecture:** Módulo de domínio `bancos/contas.ts` com `createServiceClient` + `withAudit`, gate de papel na server action (admin p/ contas bancárias, conforme RLS `contas_modify_admin`). Marcar recebido reaproveita o `marcarRecebido` já existente em `ar.ts` (server client autenticado, cria lançamento de entrada + linka + audita); só falta a UI + server action gated can_write. UI segue o padrão do repo (server component + client component p/ formulário/dialog).

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase, zod, Vitest, Tailwind/shadcn + base-ui Dialog.

**Decisões (do desenho aprovado):** saldo_atual é manual e editável (lançamentos não recalculam — fora de escopo); conta bancária = admin; marcar recebido = admin/financeiro; categoria de receita opcional, conta obrigatória; banco primeiro.

**Pré-requisitos de teste:** `supabase start` rodando; `SUPABASE_SERVICE_ROLE_KEY` (local) em `.env.local`. Rodar com `npx vitest run <arquivo>`.

---

## File Structure

**Criar:**
- `src/lib/schemas/conta-bancaria.ts` — schemas zod (`NewContaBancaria`, `AtualizarContaPatch`, `ContaTipo`).
- `src/modules/bancos/contas.ts` — `listarContasBancarias`, `criarContaBancaria`, `atualizarContaBancaria` (service role + audit, gate admin).
- `src/app/(dashboard)/config/contas-bancarias/page.tsx` — página admin (lista + ações).
- `src/components/contas-bancarias/contas-bancarias-admin.tsx` — client: form de criação + tabela com dialog de edição.
- `src/components/ar-receber-dialog.tsx` — client: botão "Receber" + dialog (data/conta/categoria).
- `tests/integration/contas-bancarias.test.ts`.

**Modificar:**
- `src/components/ar-table.tsx` — props `onMarcarRecebido`, `contas`, `categoriasReceita` + botão "Receber".
- `src/app/(dashboard)/contas-receber/page.tsx` — buscar contas/categorias, `marcarRecebidoAction`, passar props à `ARTable`.
- `src/app/(dashboard)/config/page.tsx` — adicionar card "Contas Bancárias".

**Constante de teste (ANON local):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`

---

## Task 1: Módulo de contas bancárias (schema + módulo + teste)

**Files:**
- Create: `src/lib/schemas/conta-bancaria.ts`
- Create: `src/modules/bancos/contas.ts`
- Test: `tests/integration/contas-bancarias.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/integration/contas-bancarias.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { criarContaBancaria, listarContasBancarias, atualizarContaBancaria } from '@/modules/bancos/contas'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function db() { return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }

// Cria um usuário real (linha usuarios p/ FK do audit_log). role 'financeiro' evita o singleton de admin.
async function seedUserId(): Promise<string> {
  const d = db()
  const { data } = await d.auth.admin.createUser({
    email: `cb-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`,
    password: 'seed-pass-123', email_confirm: true,
  })
  const id = data.user!.id
  await d.from('usuarios').upsert({ id, nome: 'CB Admin', role: 'financeiro' }, { onConflict: 'id' })
  return id
}

describe('contas bancárias (módulo)', () => {
  it('admin cria, lista e edita saldo; audita', async () => {
    const userId = await seedUserId()
    const actor = { id: userId, role: 'admin' }

    const criada = await criarContaBancaria(
      { banco: `NuBank-${Date.now()}`, agencia: '0001', conta: '12345-6', tipo: 'cc', saldo_atual: 5000, ativa: true },
      actor,
    )
    expect(criada.id).toBeTruthy()
    expect(Number(criada.saldo_atual)).toBe(5000)

    const lista = await listarContasBancarias()
    expect(lista.some((c) => c.id === criada.id)).toBe(true)

    const upd = await atualizarContaBancaria(criada.id, { saldo_atual: 7500, ativa: false }, actor)
    expect(Number(upd.saldo_atual)).toBe(7500)
    expect(upd.ativa).toBe(false)

    const { count } = await db().from('audit_log')
      .select('id', { count: 'exact', head: true }).eq('tabela', 'contas_bancarias').eq('registro_id', criada.id)
    expect((count ?? 0)).toBeGreaterThanOrEqual(1)
  })

  it('bloqueia chamador não-admin', async () => {
    const userId = await seedUserId()
    await expect(
      criarContaBancaria({ banco: 'X', tipo: 'cc', saldo_atual: 0, ativa: true }, { id: userId, role: 'financeiro' }),
    ).rejects.toThrow(/admin/i)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/integration/contas-bancarias.test.ts`
Expected: FAIL — módulo `@/modules/bancos/contas` não existe.

- [ ] **Step 3: Criar `src/lib/schemas/conta-bancaria.ts`**

```ts
import { z } from 'zod'

export const ContaTipo = z.enum(['cc', 'poupanca', 'investimento'])

// saldo pode ser negativo (cheque especial); no máximo 2 casas decimais
const Saldo = z.number().refine((v) => Math.round(v * 100) === v * 100, 'máximo 2 casas decimais')

export const NewContaBancaria = z.object({
  banco: z.string().min(1, 'Banco obrigatório'),
  agencia: z.string().optional(),
  conta: z.string().optional(),
  tipo: ContaTipo.default('cc'),
  saldo_atual: Saldo,
  ativa: z.boolean().default(true),
})

export const AtualizarContaPatch = z.object({
  banco: z.string().min(1).optional(),
  agencia: z.string().optional(),
  conta: z.string().optional(),
  tipo: ContaTipo.optional(),
  saldo_atual: Saldo.optional(),
  ativa: z.boolean().optional(),
})

export type NewContaBancaria = z.infer<typeof NewContaBancaria>
export type AtualizarContaPatch = z.infer<typeof AtualizarContaPatch>
```

- [ ] **Step 4: Criar `src/modules/bancos/contas.ts`**

```ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { withAudit } from '@/lib/audit'
import { NewContaBancaria, AtualizarContaPatch } from '@/lib/schemas/conta-bancaria'
import type { z } from 'zod'

export type ContaBancariaRow = {
  id: string
  banco: string
  agencia: string | null
  conta: string | null
  tipo: string
  moeda: string
  saldo_atual: number
  ativa: boolean
}

type Actor = { id: string; role: string }
function requireAdmin(actor: Actor) {
  if (actor.role !== 'admin') throw new Error('apenas admin pode gerenciar contas bancárias')
}

export async function listarContasBancarias(): Promise<ContaBancariaRow[]> {
  const admin = createServiceClient()
  const { data, error } = await admin
    .from('contas_bancarias')
    .select('id, banco, agencia, conta, tipo, moeda, saldo_atual, ativa')
    .order('banco')
  if (error) throw new Error(`listarContasBancarias: ${error.message}`)
  return (data ?? []) as ContaBancariaRow[]
}

export async function criarContaBancaria(input: z.input<typeof NewContaBancaria>, actor: Actor): Promise<ContaBancariaRow> {
  requireAdmin(actor)
  const parsed = NewContaBancaria.parse(input)
  const admin = createServiceClient()
  const id = crypto.randomUUID()
  return withAudit(
    {
      usuario_id: actor.id, acao: 'insert', tabela: 'contas_bancarias', registro_id: id,
      before: null, after: parsed as Record<string, unknown>, motivo: 'criar conta bancária',
    },
    async () => {
      const { data, error } = await admin.from('contas_bancarias').insert({ id, ...parsed }).select().single()
      if (error) throw new Error(`criarContaBancaria: ${error.message}`)
      return data as ContaBancariaRow
    },
  )
}

export async function atualizarContaBancaria(id: string, patch: z.input<typeof AtualizarContaPatch>, actor: Actor): Promise<ContaBancariaRow> {
  requireAdmin(actor)
  const parsed = AtualizarContaPatch.parse(patch)
  const admin = createServiceClient()
  return withAudit(
    {
      usuario_id: actor.id, acao: 'update', tabela: 'contas_bancarias', registro_id: id,
      before: null, after: parsed as Record<string, unknown>, motivo: 'editar conta bancária',
    },
    async () => {
      const { data, error } = await admin.from('contas_bancarias').update(parsed).eq('id', id).select().single()
      if (error) throw new Error(`atualizarContaBancaria: ${error.message}`)
      return data as ContaBancariaRow
    },
  )
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/contas-bancarias.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/conta-bancaria.ts src/modules/bancos/contas.ts tests/integration/contas-bancarias.test.ts
git commit -m "feat(bancos): módulo CRUD de contas bancárias (admin, service role + audit)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Página /config/contas-bancarias + card no /config

**Files:**
- Create: `src/components/contas-bancarias/contas-bancarias-admin.tsx`
- Create: `src/app/(dashboard)/config/contas-bancarias/page.tsx`
- Modify: `src/app/(dashboard)/config/page.tsx`

- [ ] **Step 1: Criar `src/components/contas-bancarias/contas-bancarias-admin.tsx`**

```tsx
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
export type NovaConta = { banco: string; agencia?: string; conta?: string; tipo: string; saldo_atual: number; ativa: boolean }
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
        await onCriar({ banco, agencia: agencia || undefined, conta: conta || undefined, tipo, saldo_atual: Number(saldo), ativa: true })
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
        await onAtualizar(conta.id, { banco, agencia: agencia || undefined, conta: contaNum || undefined, tipo, saldo_atual: Number(saldo), ativa })
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
```

- [ ] **Step 2: Criar `src/app/(dashboard)/config/contas-bancarias/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { listarContasBancarias, criarContaBancaria, atualizarContaBancaria } from '@/modules/bancos/contas'
import { ContasBancariasAdmin, type NovaConta, type ContaPatch } from '@/components/contas-bancarias/contas-bancarias-admin'

async function getAdminActor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (u?.role !== 'admin') redirect('/')
  return { id: user.id, role: u.role }
}

export default async function ContasBancariasPage() {
  const actor = await getAdminActor()
  const contas = await listarContasBancarias()

  async function criarAction(input: NovaConta) {
    'use server'
    const a = await getAdminActor()
    await criarContaBancaria(input, a)
    revalidatePath('/config/contas-bancarias')
  }
  async function atualizarAction(id: string, patch: ContaPatch) {
    'use server'
    const a = await getAdminActor()
    await atualizarContaBancaria(id, patch, a)
    revalidatePath('/config/contas-bancarias')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Contas Bancárias</h1>
      <p className="text-sm text-muted-foreground">
        O saldo é manual e alimenta o caixa/runway. Ajuste-o para refletir a realidade (lançamentos não recalculam o saldo automaticamente).
      </p>
      <ContasBancariasAdmin contas={contas} onCriar={criarAction} onAtualizar={atualizarAction} />
    </div>
  )
}
```

- [ ] **Step 3: Adicionar o card "Contas Bancárias" em `src/app/(dashboard)/config/page.tsx`**

No array `itens` (logo após o item de Bancos/sincronização), adicionar:
```tsx
    { href: '/config/contas-bancarias', titulo: 'Contas Bancárias', desc: 'Cadastrar contas e ajustar saldo (alimenta o caixa)' },
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build OK; rota `/config/contas-bancarias` aparece. (Isso também corrige o link 404 referenciado em `contas-pagar/page.tsx`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/contas-bancarias/contas-bancarias-admin.tsx "src/app/(dashboard)/config/contas-bancarias/page.tsx" "src/app/(dashboard)/config/page.tsx"
git commit -m "feat(bancos): tela /config/contas-bancarias (CRUD manual + saldo) — corrige 404" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Marcar recebido na tela de Contas a Receber

**Files:**
- Create: `src/components/ar-receber-dialog.tsx`
- Modify: `src/components/ar-table.tsx`
- Modify: `src/app/(dashboard)/contas-receber/page.tsx`

- [ ] **Step 1: Criar `src/components/ar-receber-dialog.tsx`**

```tsx
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
```

- [ ] **Step 2: Estender `src/components/ar-table.tsx`**

Adicionar import:
```tsx
import { ARReceberDialog, type ReceberInput } from '@/components/ar-receber-dialog'
```

Estender a assinatura (juntar com a prop `onEditar` já existente):
```tsx
export function ARTable({ rows, onEditar, onMarcarRecebido, contas = [], categoriasReceita = [] }: {
  rows: ARRow[]
  onEditar?: (id: string, patch: ARPatch) => Promise<void>
  onMarcarRecebido?: (id: string, input: ReceberInput) => Promise<void>
  contas?: { id: string; banco: string }[]
  categoriasReceita?: { id: string; nome: string }[]
}) {
```

Trocar a condição do header de Ações para cobrir as duas ações:
```tsx
              {(onEditar || onMarcarRecebido) && <th className="px-4 py-3 text-right">Ações</th>}
```

Na célula de Ações (a `<td>` que hoje renderiza o `AREditDialog` quando `onEditar`), trocar por:
```tsx
                {(onEditar || onMarcarRecebido) && (
                  <td className="px-4 py-3 text-right space-x-2">
                    {onMarcarRecebido && r.status !== 'recebido' && r.status !== 'cancelado' && (
                      <ARReceberDialog arId={r.id} contas={contas} categorias={categoriasReceita} onReceber={onMarcarRecebido} />
                    )}
                    {onEditar && (
                      <AREditDialog
                        row={{ id: r.id, data_emissao: r.data_emissao, data_vencimento: r.data_vencimento, valor: r.valor, status: r.status }}
                        onSalvar={onEditar}
                      />
                    )}
                  </td>
                )}
```

- [ ] **Step 3: Atualizar `src/app/(dashboard)/contas-receber/page.tsx`**

Estender o import de `ar.ts`:
```tsx
import { listarAR, gerarARMes, atualizarAR, marcarRecebido } from '@/modules/contas-receber/ar'
```
Importar o tipo:
```tsx
import type { ReceberInput } from '@/components/ar-receber-dialog'
```

Dentro do componente, **antes** do `return`, buscar contas ativas + categorias de receita:
```tsx
  const supabaseRead = await createClient()
  const [{ data: contasAtivas }, { data: catsReceita }] = await Promise.all([
    supabaseRead.from('contas_bancarias').select('id, banco').eq('ativa', true).order('banco'),
    supabaseRead.from('categorias').select('id, nome').eq('tipo', 'receita').eq('ativa', true).order('nome'),
  ])
```

Adicionar a server action (após `editarARAction`):
```tsx
  async function marcarRecebidoAction(id: string, input: ReceberInput) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('não autenticado')
    const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
    if (!u || !['admin', 'financeiro'].includes(u.role)) throw new Error('sem permissão para marcar recebido')
    await marcarRecebido(id, input.dataRecebimento, input.contaId, input.categoriaId, user.id)
    revalidatePath('/contas-receber')
  }
```

Trocar a renderização da `ARTable` por:
```tsx
      <ARTable
        rows={typed}
        onEditar={editarARAction}
        onMarcarRecebido={marcarRecebidoAction}
        contas={contasAtivas ?? []}
        categoriasReceita={catsReceita ?? []}
      />
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build OK; `/contas-receber` compila.

- [ ] **Step 5: Commit**

```bash
git add src/components/ar-receber-dialog.tsx src/components/ar-table.tsx "src/app/(dashboard)/contas-receber/page.tsx"
git commit -m "feat(ar): marcar recebido pela tela (cria lançamento, alimenta DRE)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verificação final

- [ ] **Step 1: Suíte unitária**

Run: `npm run test:unit`
Expected: PASS (sem regressão).

- [ ] **Step 2: Teste de integração novo**

Run: `npx vitest run tests/integration/contas-bancarias.test.ts`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build OK; rotas `/config/contas-bancarias` e `/contas-receber` presentes.

- [ ] **Step 4: Verificação manual (skill `run`)**

`npm run dev` → admin →
1. `/config/contas-bancarias`: criar uma conta com saldo; editar o saldo; ver refletir no caixa do dashboard/fluxo-caixa.
2. `/contas-receber`: numa AR `previsto`, clicar **Receber** → escolher data + conta → confirmar → status vira `recebido` e o valor aparece no `/relatorios` (DRE do mês do recebimento).

---

## Notas

- `marcarRecebido` já existia (cria lançamento de entrada + linka + audita) — esta entrega só adiciona a UI + a server action gated admin/financeiro.
- Contas bancárias = admin (coerente com a RLS `contas_modify_admin`). saldo manual; recalcular saldo a partir de lançamentos fica fora de escopo.
