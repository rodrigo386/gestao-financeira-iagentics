# Editar AR + índice /config + DRE /relatorios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar datas/valor/status de uma Conta a Receber; criar a página índice `/config` (corrige 404); criar `/relatorios` com DRE realizada (caixa) por mês + export CSV (corrige 404).

**Architecture:** Lógica de domínio testável em módulos que usam o **service client** (`createServiceClient`) e recebem `usuarioId`/`mesRef` explícitos — o gate de papel (admin/financeiro) é aplicado na camada de app (server action resolve a sessão). Mutações sensíveis passam por `withAudit`. UI segue o padrão do repo (server components + um client component só onde há interação — o Dialog de edição).

**Tech Stack:** Next.js 16 (App Router, Server Actions, route handlers), Supabase (`@supabase/supabase-js` service client), zod, Vitest (integração), Tailwind/shadcn + base-ui Dialog.

**Spec:** [docs/superpowers/specs/2026-05-31-editar-ar-config-relatorios-dre-design.md](../specs/2026-05-31-editar-ar-config-relatorios-dre-design.md)

**Pré-requisitos de teste:** `supabase start` rodando; `SUPABASE_SERVICE_ROLE_KEY` (local) em `.env.local` (carregado por `tests/integration/setup.ts`). Rodar testes de integração com `npx vitest run <arquivo>`.

---

## File Structure

**Criar:**
- `src/components/ar-edit-dialog.tsx` — client; botão "Editar" + Dialog (emissão/vencimento/valor/status).
- `src/app/(dashboard)/config/page.tsx` — índice de Configurações (server).
- `src/modules/relatorios/dre.ts` — `calcularDRE(mesRef)` (service client).
- `src/app/(dashboard)/relatorios/page.tsx` — DRE na tela + seletor de mês + link CSV (server).
- `src/app/api/relatorios/dre.csv/route.ts` — export CSV (GET, protegido pelo middleware).
- `tests/integration/atualizar-ar.test.ts`, `tests/integration/dre.test.ts`.

**Modificar:**
- `src/lib/schemas/ar.ts` — schema `AtualizarARPatch`.
- `src/modules/contas-receber/ar.ts` — `atualizarAR(id, patch, usuarioId)`.
- `src/components/ar-table.tsx` — coluna "Ações" + prop `onEditar`.
- `src/app/(dashboard)/contas-receber/page.tsx` — `editarARAction` + passar `onEditar` à `ARTable`.

**Constante de teste (chave ANON local, segura em repo):**
`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`

---

## Task 1: `atualizarAR` (módulo + schema + teste)

**Files:**
- Modify: `src/lib/schemas/ar.ts`
- Modify: `src/modules/contas-receber/ar.ts`
- Test: `tests/integration/atualizar-ar.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/integration/atualizar-ar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { atualizarAR } from '@/modules/contas-receber/ar'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function db() { return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }

async function seedUserId(): Promise<string> {
  const d = db()
  const { data } = await d.auth.admin.createUser({
    email: `ar-edit-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`,
    password: 'seed-pass-123', email_confirm: true,
  })
  const id = data.user!.id
  // audit_log.usuario_id referencia usuarios(id) → precisa de uma linha usuarios.
  // role 'financeiro' evita o índice singleton de admin.
  await d.from('usuarios').upsert({ id, nome: 'AR Editor', role: 'financeiro' }, { onConflict: 'id' })
  return id
}

async function seedAR(): Promise<{ arId: string; clienteId: string }> {
  const d = db()
  const { data: c } = await d.from('clientes')
    .insert({ nome: `Acme-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, status: 'ativo' }).select().single()
  const { data: ar } = await d.from('contas_a_receber').insert({
    cliente_id: c!.id, origem: 'avulso', valor: 1000, moeda: 'BRL',
    data_emissao: '2026-05-01', data_vencimento: '2026-05-10', status: 'previsto',
  }).select().single()
  return { arId: ar!.id, clienteId: c!.id }
}

describe('atualizarAR', () => {
  it('edita datas, valor e status; grava audit', async () => {
    const userId = await seedUserId()
    const { arId } = await seedAR()
    const upd = await atualizarAR(arId, { data_vencimento: '2026-05-20', valor: 1500, status: 'emitido' }, userId)
    expect(Number(upd.valor)).toBe(1500)
    expect(upd.data_vencimento).toBe('2026-05-20')
    expect(upd.status).toBe('emitido')

    const { count } = await db().from('audit_log')
      .select('id', { count: 'exact', head: true }).eq('registro_id', arId).eq('tabela', 'contas_a_receber')
    expect((count ?? 0)).toBeGreaterThanOrEqual(1)
  })

  it('rejeita vencimento < emissão', async () => {
    const userId = await seedUserId()
    const { arId } = await seedAR()
    await expect(atualizarAR(arId, { data_vencimento: '2026-04-01' }, userId)).rejects.toThrow(/vencimento/i)
  })

  it('rejeita valor <= 0', async () => {
    const userId = await seedUserId()
    const { arId } = await seedAR()
    await expect(atualizarAR(arId, { valor: 0 }, userId)).rejects.toThrow()
  })

  it('rejeita editar AR recebida', async () => {
    const userId = await seedUserId()
    const { arId } = await seedAR()
    await db().from('contas_a_receber').update({ status: 'recebido' }).eq('id', arId)
    await expect(atualizarAR(arId, { valor: 2000 }, userId)).rejects.toThrow(/recebida/i)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/integration/atualizar-ar.test.ts`
Expected: FAIL — `atualizarAR` não exportado.

- [ ] **Step 3: Adicionar o schema em `src/lib/schemas/ar.ts`**

Após o bloco `NewContaAReceber` (antes de `ContaAReceber`), adicionar:

```ts
export const AtualizarARPatch = z.object({
  data_emissao: DateStr.optional(),
  data_vencimento: DateStr.optional(),
  valor: Money.refine((v) => v > 0, 'valor deve ser > 0').optional(),
  status: z.enum(['previsto', 'emitido', 'atrasado', 'cancelado']).optional(),
})
export type AtualizarARPatch = z.infer<typeof AtualizarARPatch>
```

(`DateStr` e `Money` já estão no escopo do arquivo.)

- [ ] **Step 4: Implementar `atualizarAR` em `src/modules/contas-receber/ar.ts`**

Estender o import de schema do topo:
```ts
import { NewContaAReceber, ContaAReceber, AtualizarARPatch } from '@/lib/schemas/ar'
```

Adicionar ao final do arquivo:
```ts
/**
 * Edita datas/valor/status de uma AR (ajuste manual realidade × planejado).
 * Usa service client (gate de papel é feito na camada de app). Audita.
 * Rejeita editar AR já 'recebido' (liquidada com lançamento).
 */
export async function atualizarAR(
  id: string,
  patch: z.input<typeof AtualizarARPatch>,
  usuarioId: string,
): Promise<ContaAReceber> {
  const parsed = AtualizarARPatch.parse(patch)
  const admin = createServiceClient()
  const { data: before, error: bErr } = await admin
    .from('contas_a_receber').select('*').eq('id', id).single()
  if (bErr || !before) throw new Error('AR não encontrada')
  const atual = before as ContaAReceber
  if (atual.status === 'recebido') {
    throw new Error('AR recebida não pode ser editada; cancele o recebimento primeiro')
  }
  const merged = {
    data_emissao: parsed.data_emissao ?? atual.data_emissao,
    data_vencimento: parsed.data_vencimento ?? atual.data_vencimento,
    valor: parsed.valor ?? atual.valor,
    status: parsed.status ?? atual.status,
  }
  if (merged.data_vencimento < merged.data_emissao) {
    throw new Error('data_vencimento deve ser >= data_emissao')
  }
  return withAudit(
    {
      usuario_id: usuarioId, acao: 'update', tabela: 'contas_a_receber', registro_id: id,
      before: atual as unknown as Record<string, unknown>, after: merged as Record<string, unknown>,
      motivo: 'editar AR (datas/valor/status)',
    },
    async () => {
      const { data, error } = await admin
        .from('contas_a_receber').update(merged).eq('id', id).select().single()
      if (error) throw new Error(`atualizarAR: ${error.message}`)
      return data as ContaAReceber
    },
  )
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/atualizar-ar.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/ar.ts src/modules/contas-receber/ar.ts tests/integration/atualizar-ar.test.ts
git commit -m "feat(ar): atualizarAR (edita datas/valor/status, audita, bloqueia recebido)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: UI de edição da AR (Dialog + tabela + ação)

**Files:**
- Create: `src/components/ar-edit-dialog.tsx`
- Modify: `src/components/ar-table.tsx`
- Modify: `src/app/(dashboard)/contas-receber/page.tsx`

- [ ] **Step 1: Criar `src/components/ar-edit-dialog.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ARPatch = { data_emissao?: string; data_vencimento?: string; valor?: number; status?: string }
type Row = { id: string; data_emissao: string; data_vencimento: string; valor: number; status: string }

const STATUS_EDIT = ['previsto', 'emitido', 'atrasado', 'cancelado'] as const

export function AREditDialog({ row, onSalvar }: { row: Row; onSalvar: (id: string, patch: ARPatch) => Promise<void> }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [emissao, setEmissao] = useState(row.data_emissao)
  const [vencimento, setVencimento] = useState(row.data_vencimento)
  const [valor, setValor] = useState(String(row.valor))
  const [status, setStatus] = useState(row.status)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  if (row.status === 'recebido') {
    return <Button variant="outline" size="sm" disabled title="AR recebida não pode ser editada">Editar</Button>
  }

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onSalvar(row.id, {
          data_emissao: emissao,
          data_vencimento: vencimento,
          valor: Number(valor),
          status,
        })
        setOpen(false)
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Editar</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar conta a receber</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ar-emissao">Emissão</Label>
              <Input id="ar-emissao" type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ar-venc">Vencimento</Label>
              <Input id="ar-venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ar-valor">Valor (R$)</Label>
              <Input id="ar-valor" type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ar-status">Status</Label>
              <select id="ar-status" className="w-full border border-border rounded-md px-2 py-1 text-sm bg-background"
                value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_EDIT.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
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

- [ ] **Step 2: Adicionar coluna "Ações" + prop `onEditar` em `src/components/ar-table.tsx`**

Adicionar o import no topo:
```tsx
import { AREditDialog, type ARPatch } from '@/components/ar-edit-dialog'
```

Trocar a assinatura:
```tsx
export function ARTable({ rows }: { rows: ARRow[] }) {
```
por:
```tsx
export function ARTable({ rows, onEditar }: { rows: ARRow[]; onEditar?: (id: string, patch: ARPatch) => Promise<void> }) {
```

No `<thead>`, após o `<th>Status</th>`, adicionar:
```tsx
              {onEditar && <th className="px-4 py-3 text-right">Ações</th>}
```

No `<tbody>`, na linha de cada row, após a `<td>` do Status (`<td className="px-4 py-3"><Badge ...></td>`), adicionar:
```tsx
                {onEditar && (
                  <td className="px-4 py-3 text-right">
                    <AREditDialog
                      row={{ id: r.id, data_emissao: r.data_emissao, data_vencimento: r.data_vencimento, valor: r.valor, status: r.status }}
                      onSalvar={onEditar}
                    />
                  </td>
                )}
```

- [ ] **Step 3: Adicionar `editarARAction` e passar `onEditar` em `src/app/(dashboard)/contas-receber/page.tsx`**

Estender o import de `ar.ts`:
```tsx
import { listarAR, gerarARMes, atualizarAR } from '@/modules/contas-receber/ar'
```
Importar o tipo do patch (logo abaixo dos imports existentes):
```tsx
import type { ARPatch } from '@/components/ar-edit-dialog'
```

Dentro do componente, após `gerarAction`, adicionar:
```tsx
  async function editarARAction(id: string, patch: ARPatch) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('não autenticado')
    const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
    if (!u || !['admin', 'financeiro'].includes(u.role)) throw new Error('sem permissão para editar AR')
    await atualizarAR(id, patch, user.id)
    revalidatePath('/contas-receber')
  }
```

Trocar `<ARTable rows={typed} />` por:
```tsx
      <ARTable rows={typed} onEditar={editarARAction} />
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build OK; rota `/contas-receber` compila.

- [ ] **Step 5: Commit**

```bash
git add src/components/ar-edit-dialog.tsx src/components/ar-table.tsx "src/app/(dashboard)/contas-receber/page.tsx"
git commit -m "feat(ar): edição por linha (Dialog) na tela Contas a Receber, gated admin/financeiro" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Índice /config (corrige 404)

**Files:**
- Create: `src/app/(dashboard)/config/page.tsx`

- [ ] **Step 1: Criar `src/app/(dashboard)/config/page.tsx`**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ConfigPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let isAdmin = false
  if (user) {
    const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
    isAdmin = u?.role === 'admin'
  }

  const itens: { href: string; titulo: string; desc: string }[] = [
    { href: '/config/bancos', titulo: 'Bancos', desc: 'Contas bancárias e sincronização' },
    { href: '/config/regras-categorizacao', titulo: 'Regras de Categorização', desc: 'Padrões → categoria automática' },
  ]
  if (isAdmin) {
    itens.push({ href: '/config/usuarios', titulo: 'Usuários', desc: 'Criar/gerenciar usuários (admin)' })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {itens.map((it) => (
          <Link key={it.href} href={it.href}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader><CardTitle className="text-base">{it.titulo}</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{it.desc}</p></CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: build OK; rota `/config` aparece (estática/dinâmica).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/config/page.tsx"
git commit -m "feat(config): página índice /config com atalhos (corrige 404 de Configurações)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `calcularDRE` (módulo + teste)

**Files:**
- Create: `src/modules/relatorios/dre.ts`
- Test: `tests/integration/dre.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/integration/dre.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { calcularDRE } from '@/modules/relatorios/dre'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function db() { return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }

describe('calcularDRE', () => {
  it('agrupa por categoria, separa receita/despesa, ignora transferência e mês de fora', async () => {
    const d = db()
    const { data: conta } = await d.from('contas_bancarias')
      .insert({ banco: `Test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, tipo: 'cc', saldo_atual: 0 }).select().single()
    // Reusa categorias do seed (evita depender do schema/enum de categorias).
    const { data: cats } = await d.from('categorias').select('id, nome').limit(2)
    const catRec = cats![0]!
    const catDesp = cats![1]!
    const contaId = conta!.id

    const base = (over: Record<string, unknown>) => ({
      conta_id: contaId, descricao: 'x', origem: 'manual', ...over,
    })
    await d.from('lancamentos').insert([
      base({ data: '2026-06-10', valor: 1000, tipo: 'entrada', categoria_id: catRec.id }),
      base({ data: '2026-06-15', valor: 500, tipo: 'entrada', categoria_id: catRec.id }),
      base({ data: '2026-06-20', valor: 300, tipo: 'saida', categoria_id: catDesp.id }),
      base({ data: '2026-06-25', valor: 999, tipo: 'transferencia', categoria_id: catDesp.id }),
      base({ data: '2026-07-01', valor: 7777, tipo: 'entrada', categoria_id: catRec.id }),
    ])

    const dre = await calcularDRE('2026-06-01')
    const rec = dre.receitas.find((r) => r.categoria === catRec.nome)
    const desp = dre.despesas.find((r) => r.categoria === catDesp.nome)
    expect(rec?.total).toBe(1500)            // 1000 + 500, exclui julho
    expect(desp?.total).toBe(300)
    expect(dre.totalReceitas).toBeGreaterThanOrEqual(1500)
    expect(dre.resultado).toBe(dre.totalReceitas - dre.totalDespesas)
    // transferência não entra
    expect(dre.despesas.some((r) => r.total === 999)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/integration/dre.test.ts`
Expected: FAIL — `calcularDRE` não existe.

- [ ] **Step 3: Criar `src/modules/relatorios/dre.ts`**

```ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

export type DRELinha = { categoria: string; total: number }
export type DRE = {
  mesRef: string
  receitas: DRELinha[]
  despesas: DRELinha[]
  totalReceitas: number
  totalDespesas: number
  resultado: number
}

/** DRE realizada (caixa): agrupa lançamentos do mês por categoria. mesRef = 'YYYY-MM-01'. */
export async function calcularDRE(mesRef: string): Promise<DRE> {
  const [y, m] = mesRef.split('-').map(Number)
  const fim = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10) // último dia do mês
  const admin = createServiceClient()
  const { data, error } = await admin
    .from('lancamentos')
    .select('valor, tipo, categoria:categorias(nome)')
    .gte('data', mesRef)
    .lte('data', fim)
    .neq('tipo', 'transferencia')
  if (error) throw new Error(`calcularDRE: ${error.message}`)

  const recMap = new Map<string, number>()
  const despMap = new Map<string, number>()
  for (const l of data ?? []) {
    const nome = (l.categoria as { nome?: string } | null)?.nome ?? 'Sem categoria'
    const map = l.tipo === 'entrada' ? recMap : despMap
    map.set(nome, (map.get(nome) ?? 0) + Number(l.valor))
  }
  const toLinhas = (mp: Map<string, number>): DRELinha[] =>
    [...mp.entries()].map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total)

  const receitas = toLinhas(recMap)
  const despesas = toLinhas(despMap)
  const totalReceitas = receitas.reduce((s, r) => s + r.total, 0)
  const totalDespesas = despesas.reduce((s, r) => s + r.total, 0)
  return { mesRef, receitas, despesas, totalReceitas, totalDespesas, resultado: totalReceitas - totalDespesas }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/dre.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/relatorios/dre.ts tests/integration/dre.test.ts
git commit -m "feat(relatorios): calcularDRE realizada (caixa) por mês" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Página /relatorios + export CSV (corrige 404)

**Files:**
- Create: `src/app/(dashboard)/relatorios/page.tsx`
- Create: `src/app/api/relatorios/dre.csv/route.ts`

- [ ] **Step 1: Criar a rota de export `src/app/api/relatorios/dre.csv/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { calcularDRE } from '@/modules/relatorios/dre'

export async function GET(request: NextRequest) {
  const month = new URL(request.url).searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month inválido (use YYYY-MM)' }, { status: 400 })
  }
  const dre = await calcularDRE(`${month}-01`)
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const linhas = ['Secao,Categoria,Valor']
  for (const r of dre.receitas) linhas.push(`Receita,${esc(r.categoria)},${r.total.toFixed(2)}`)
  linhas.push(`Total,Receitas,${dre.totalReceitas.toFixed(2)}`)
  for (const d of dre.despesas) linhas.push(`Despesa,${esc(d.categoria)},${d.total.toFixed(2)}`)
  linhas.push(`Total,Despesas,${dre.totalDespesas.toFixed(2)}`)
  linhas.push(`Total,Resultado,${dre.resultado.toFixed(2)}`)
  return new NextResponse(linhas.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="dre-${month}.csv"`,
    },
  })
}
```

- [ ] **Step 2: Criar a página `src/app/(dashboard)/relatorios/page.tsx`**

```tsx
import { calcularDRE } from '@/modules/relatorios/dre'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function fmt(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams
  const mes = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7)
  const dre = await calcularDRE(`${mes}-01`)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Relatórios — DRE (realizada)</h1>
        <div className="flex items-end gap-3">
          <form method="get" className="flex items-end gap-2">
            <div className="space-y-1">
              <label htmlFor="month" className="block text-xs text-muted-foreground">Mês</label>
              <input id="month" name="month" type="month" defaultValue={mes}
                className="border border-border rounded-md px-2 py-1 text-sm bg-background" />
            </div>
            <Button type="submit" variant="outline">Ver</Button>
          </form>
          <a href={`/api/relatorios/dre.csv?month=${mes}`}>
            <Button type="button">Exportar CSV</Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Receitas</CardTitle></CardHeader>
          <CardContent>
            {dre.receitas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem receitas no mês.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {dre.receitas.map((r) => (
                  <li key={r.categoria} className="flex justify-between">
                    <span className="text-muted-foreground">{r.categoria}</span>
                    <span className="text-emerald-400">{fmt(r.total)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total receitas</span><span className="text-emerald-400">{fmt(dre.totalReceitas)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Despesas</CardTitle></CardHeader>
          <CardContent>
            {dre.despesas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem despesas no mês.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {dre.despesas.map((r) => (
                  <li key={r.categoria} className="flex justify-between">
                    <span className="text-muted-foreground">{r.categoria}</span>
                    <span className="text-rose-400">{fmt(r.total)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total despesas</span><span className="text-rose-400">{fmt(dre.totalDespesas)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-lg font-semibold">Resultado</span>
          <span className={`text-2xl font-semibold ${dre.resultado >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {fmt(dre.resultado)}
          </span>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build OK; rotas `/relatorios` e `/api/relatorios/dre.csv` aparecem.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/relatorios/page.tsx" "src/app/api/relatorios/dre.csv/route.ts"
git commit -m "feat(relatorios): página DRE /relatorios + export CSV (corrige 404)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verificação final

**Files:** nenhum (apenas execução)

- [ ] **Step 1: Suíte unitária**

Run: `npm run test:unit`
Expected: PASS (sem regressão).

- [ ] **Step 2: Testes de integração novos**

Run: `npx vitest run tests/integration/atualizar-ar.test.ts tests/integration/dre.test.ts`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build conclui sem erros; rotas `/config`, `/relatorios`, `/api/relatorios/dre.csv` presentes.

- [ ] **Step 4: Verificação manual (skill `run`)**

`npm run dev` → logar como admin →
1. `/contas-receber`: clicar "Editar" numa AR previsto → mudar vencimento/valor/status → salvar → linha atualiza. Tentar editar uma AR recebida → botão desabilitado.
2. `/config`: cards Bancos / Regras / Usuários (Usuários só admin).
3. `/relatorios`: DRE do mês, trocar o mês, "Exportar CSV" baixa o arquivo.

---

## Notas

- `atualizarAR` e `calcularDRE` usam `createServiceClient` (testáveis em vitest, sem `cookies()`); o gate de papel (admin/financeiro p/ editar AR) é feito na server action da página. Leitura de relatório/`/config` exige só sessão (middleware) — `/config/usuarios` permanece admin-only por conta própria.
- A rota `/api/relatorios/dre.csv` é protegida pelo middleware (não está em `PUBLIC_PATHS`).
