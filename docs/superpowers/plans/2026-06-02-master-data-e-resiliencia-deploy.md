# Master Data + resiliência de deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Uma tela única **`/master-data`** (admin) para consultar e excluir os cadastros de referência, com "Novo"/"Editar" abrindo as telas existentes; (B) resiliência contra a falha "This page couldn't load" pós-deploy (auto-reload em erro de chunk + error boundary amigável no dashboard).

**Architecture:** Um **registry tipado** (allowlist fixa de entidades → tabela/colunas/links; sem SQL dinâmico nem tabela arbitrária) dirige um módulo genérico (`listarEntidade`/`excluirEntidade`, service role + audit, exclusão **admin-gated e FK-safe**). Página server com seletor de entidade via `?entity=` + componente client (busca + excluir). Resiliência = um guard client global (escuta erros de chunk e recarrega uma vez) + `error.tsx` do segmento dashboard.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (service client), Vitest, Tailwind/shadcn.

**Decisões (do desenho aprovado):** escopo = só cadastros de referência (clientes, contratos, projetos, fornecedores, funcionários, PJ spot, categorias, contas bancárias); operações na tela = consultar + excluir; criar/editar reusam telas existentes; área **admin-only**.

**Pré-requisitos de teste:** `supabase start` rodando; `SUPABASE_SERVICE_ROLE_KEY` (local) em `.env.local`.

---

## File Structure

**Criar:**
- `src/modules/master-data/registry.ts` — allowlist tipada das 8 entidades.
- `src/modules/master-data/master-data.ts` — `listarEntidade`, `excluirEntidade` (service role + audit, admin gate, FK-safe).
- `src/app/(dashboard)/master-data/page.tsx` — página admin (seletor + tabela).
- `src/components/master-data/master-data-table.tsx` — client (busca + excluir + links).
- `src/components/chunk-reload-guard.tsx` — client (auto-reload em erro de chunk).
- `src/app/(dashboard)/error.tsx` — error boundary amigável do dashboard.
- `tests/integration/master-data.test.ts`.

**Modificar:**
- `src/components/sidebar.tsx` — item "Master Data" (admin-only).
- `src/app/layout.tsx` — montar `<ChunkReloadGuard />`.

**Constante de teste (ANON local):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`

---

## Task 1: Registry + módulo master-data (+ teste)

**Files:**
- Create: `src/modules/master-data/registry.ts`
- Create: `src/modules/master-data/master-data.ts`
- Test: `tests/integration/master-data.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/integration/master-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { listarEntidade, excluirEntidade } from '@/modules/master-data/master-data'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function db() { return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }

async function seedUserId(): Promise<string> {
  const d = db()
  const { data } = await d.auth.admin.createUser({
    email: `md-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`,
    password: 'seed-pass-123', email_confirm: true,
  })
  const id = data.user!.id
  await d.from('usuarios').upsert({ id, nome: 'MD', role: 'financeiro' }, { onConflict: 'id' })
  return id
}

describe('master-data', () => {
  it('lista e exclui um cadastro sem vínculos', async () => {
    const userId = await seedUserId()
    const actor = { id: userId, role: 'admin' }
    const { data: c } = await db().from('clientes').insert({ nome: `MDCli-${Date.now()}`, status: 'ativo' }).select().single()

    const lista = await listarEntidade('clientes')
    expect(lista.some((r) => r.id === c!.id)).toBe(true)

    await excluirEntidade('clientes', c!.id, actor)
    const { data: depois } = await db().from('clientes').select('id').eq('id', c!.id).maybeSingle()
    expect(depois).toBeNull()
  })

  it('bloqueia exclusão quando há vínculo (FK) com mensagem amigável', async () => {
    const userId = await seedUserId()
    const actor = { id: userId, role: 'admin' }
    const { data: c } = await db().from('clientes').insert({ nome: `MDCli2-${Date.now()}`, status: 'ativo' }).select().single()
    // projetos.cliente_id é ON DELETE RESTRICT (migration 0008) → exclusão do cliente bloqueia
    await db().from('projetos').insert({
      cliente_id: c!.id, nome: 'Proj X', valor_total: 1000,
      data_inicio: '2026-01-01', data_prevista_fim: '2026-06-01', status: 'ativo',
    })
    await expect(excluirEntidade('clientes', c!.id, actor)).rejects.toThrow(/vinculados/i)
  })

  it('bloqueia chamador não-admin', async () => {
    const userId = await seedUserId()
    const { data: c } = await db().from('clientes').insert({ nome: `MDCli3-${Date.now()}`, status: 'ativo' }).select().single()
    await expect(excluirEntidade('clientes', c!.id, { id: userId, role: 'financeiro' })).rejects.toThrow(/admin/i)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/integration/master-data.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `src/modules/master-data/registry.ts`**

```ts
export type ColunaTipo = 'texto' | 'moeda' | 'bool'
export type ColunaMD = { campo: string; label: string; tipo?: ColunaTipo }
export type EntidadeMD = {
  key: string
  label: string
  table: string
  buscaCampo: string
  colunas: ColunaMD[]
  novoHref?: string
  editarHrefBase?: string // href = `${base}/${id}`
  editarHrefFixo?: string // href fixo (sem id)
}

export const ENTIDADES: EntidadeMD[] = [
  {
    key: 'clientes', label: 'Clientes', table: 'clientes', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'cnpj', label: 'CNPJ' }, { campo: 'status', label: 'Status' }],
    novoHref: '/receitas/clientes/novo', editarHrefBase: '/receitas/clientes',
  },
  {
    key: 'contratos', label: 'Contratos', table: 'contratos', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'tipo', label: 'Tipo' }, { campo: 'ticket', label: 'Ticket', tipo: 'moeda' }, { campo: 'status', label: 'Status' }],
    novoHref: '/receitas/contratos/novo', editarHrefBase: '/receitas/contratos',
  },
  {
    key: 'projetos', label: 'Projetos', table: 'projetos', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'valor_total', label: 'Valor', tipo: 'moeda' }, { campo: 'status', label: 'Status' }],
    novoHref: '/receitas/projetos/novo', editarHrefBase: '/receitas/projetos',
  },
  {
    key: 'fornecedores', label: 'Fornecedores', table: 'fornecedores', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'cnpj', label: 'CNPJ' }, { campo: 'ativo', label: 'Ativo', tipo: 'bool' }],
    novoHref: '/despesas/fornecedores/novo', editarHrefBase: '/despesas/fornecedores',
  },
  {
    key: 'funcionarios', label: 'Funcionários', table: 'funcionarios', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'cargo', label: 'Cargo' }, { campo: 'tipo', label: 'Tipo' }, { campo: 'salario_base', label: 'Salário', tipo: 'moeda' }],
    novoHref: '/folha/funcionarios/novo', editarHrefBase: '/folha/funcionarios',
  },
  {
    key: 'pj_spot', label: 'PJ Spot', table: 'pj_spot', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'especialidade', label: 'Especialidade' }, { campo: 'ativo', label: 'Ativo', tipo: 'bool' }],
    novoHref: '/folha/pj-spot/novo', editarHrefBase: '/folha/pj-spot',
  },
  {
    key: 'categorias', label: 'Categorias', table: 'categorias', buscaCampo: 'nome',
    colunas: [{ campo: 'nome', label: 'Nome' }, { campo: 'tipo', label: 'Tipo' }, { campo: 'ativa', label: 'Ativa', tipo: 'bool' }],
  },
  {
    key: 'contas_bancarias', label: 'Contas Bancárias', table: 'contas_bancarias', buscaCampo: 'banco',
    colunas: [{ campo: 'banco', label: 'Banco' }, { campo: 'tipo', label: 'Tipo' }, { campo: 'saldo_atual', label: 'Saldo', tipo: 'moeda' }, { campo: 'ativa', label: 'Ativa', tipo: 'bool' }],
    novoHref: '/config/contas-bancarias', editarHrefFixo: '/config/contas-bancarias',
  },
]

export function getEntidade(key: string): EntidadeMD | undefined {
  return ENTIDADES.find((e) => e.key === key)
}
```

- [ ] **Step 4: Criar `src/modules/master-data/master-data.ts`**

```ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { withAudit } from '@/lib/audit'
import { getEntidade } from './registry'

type Actor = { id: string; role: string }

export async function listarEntidade(key: string, busca?: string): Promise<Record<string, unknown>[]> {
  const ent = getEntidade(key)
  if (!ent) throw new Error(`entidade desconhecida: ${key}`)
  const campos = ['id', ...ent.colunas.map((c) => c.campo)].join(', ')
  const admin = createServiceClient()
  let q = admin.from(ent.table).select(campos).order(ent.buscaCampo).limit(500)
  if (busca && busca.trim()) q = q.ilike(ent.buscaCampo, `%${busca.trim()}%`)
  const { data, error } = await q
  if (error) throw new Error(`listarEntidade(${key}): ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

export async function excluirEntidade(key: string, id: string, actor: Actor): Promise<void> {
  if (actor.role !== 'admin') throw new Error('apenas admin pode excluir cadastros')
  const ent = getEntidade(key)
  if (!ent) throw new Error(`entidade desconhecida: ${key}`)
  const admin = createServiceClient()
  const { data: before } = await admin.from(ent.table).select('*').eq('id', id).maybeSingle()
  if (!before) throw new Error('registro não encontrado')
  await withAudit(
    {
      usuario_id: actor.id, acao: 'delete', tabela: ent.table, registro_id: id,
      before: before as Record<string, unknown>, after: null, motivo: 'master data: excluir',
    },
    async () => {
      const { error } = await admin.from(ent.table).delete().eq('id', id)
      if (error) {
        if (error.code === '23503') {
          throw new Error('Não é possível excluir: há registros vinculados a este cadastro. Remova/atualize os vínculos primeiro.')
        }
        throw new Error(`excluirEntidade(${key}): ${error.message}`)
      }
    },
  )
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/master-data.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add src/modules/master-data/registry.ts src/modules/master-data/master-data.ts tests/integration/master-data.test.ts
git commit -m "feat(master-data): registry + listarEntidade/excluirEntidade (admin, audit, FK-safe)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Página /master-data + tabela client + sidebar

**Files:**
- Create: `src/components/master-data/master-data-table.tsx`
- Create: `src/app/(dashboard)/master-data/page.tsx`
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Criar `src/components/master-data/master-data-table.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { EntidadeMD } from '@/modules/master-data/registry'

function fmtCell(valor: unknown, tipo?: string): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (tipo === 'moeda') return 'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  if (tipo === 'bool') return valor ? 'sim' : 'não'
  return String(valor)
}

export function MasterDataTable({ entidade, rows, busca, onExcluir }: {
  entidade: EntidadeMD
  rows: Record<string, unknown>[]
  busca: string
  onExcluir: (key: string, id: string) => Promise<void>
}) {
  const router = useRouter()
  const [q, setQ] = useState(busca)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function buscar(e: React.FormEvent) {
    e.preventDefault()
    router.push(`/master-data?entity=${entidade.key}&q=${encodeURIComponent(q)}`)
  }

  function excluir(id: string, label: string) {
    setErr(null)
    if (!window.confirm(`Excluir "${label}"? Esta ação é permanente.`)) return
    start(async () => {
      try { await onExcluir(entidade.key, id); router.refresh() }
      catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao excluir') }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={buscar} className="flex items-end gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar por ${entidade.buscaCampo}...`} className="w-64" />
          <Button type="submit" variant="outline">Buscar</Button>
        </form>
        {entidade.novoHref && <Link href={entidade.novoHref}><Button>Novo</Button></Link>}
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            {entidade.colunas.map((c) => <TableHead key={c.campo}>{c.label}</TableHead>)}
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={entidade.colunas.length + 1} className="text-muted-foreground">Nenhum registro.</TableCell></TableRow>
          ) : rows.map((r) => {
            const id = String(r.id)
            const editarHref = entidade.editarHrefFixo ?? (entidade.editarHrefBase ? `${entidade.editarHrefBase}/${id}` : undefined)
            const label = String(r[entidade.buscaCampo] ?? id)
            return (
              <TableRow key={id}>
                {entidade.colunas.map((c) => <TableCell key={c.campo}>{fmtCell(r[c.campo], c.tipo)}</TableCell>)}
                <TableCell className="text-right space-x-3">
                  {editarHref && <Link href={editarHref} className="text-primary underline text-sm">Editar</Link>}
                  <Button variant="destructive" size="sm" disabled={pending} onClick={() => excluir(id, label)}>Excluir</Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Criar `src/app/(dashboard)/master-data/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ENTIDADES, getEntidade } from '@/modules/master-data/registry'
import { listarEntidade, excluirEntidade } from '@/modules/master-data/master-data'
import { MasterDataTable } from '@/components/master-data/master-data-table'

async function getAdminActor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (u?.role !== 'admin') redirect('/')
  return { id: user.id, role: u.role }
}

export default async function MasterDataPage({ searchParams }: { searchParams: Promise<{ entity?: string; q?: string }> }) {
  await getAdminActor()
  const { entity, q } = await searchParams
  const ent = getEntidade(entity ?? '') ?? ENTIDADES[0]!
  const rows = await listarEntidade(ent.key, q)

  async function excluirAction(key: string, id: string) {
    'use server'
    const a = await getAdminActor()
    await excluirEntidade(key, id, a)
    revalidatePath('/master-data')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Master Data</h1>
        <p className="text-sm text-muted-foreground">Consulte e exclua cadastros. Criar/editar abre a tela específica de cada cadastro.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ENTIDADES.map((e) => (
          <Link key={e.key} href={`/master-data?entity=${e.key}`}
            className={'px-3 py-1.5 rounded-md text-sm border ' + (e.key === ent.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            {e.label}
          </Link>
        ))}
      </div>
      <MasterDataTable entidade={ent} rows={rows} busca={q ?? ''} onExcluir={excluirAction} />
    </div>
  )
}
```

- [ ] **Step 3: Adicionar "Master Data" no sidebar (admin-only) — `src/components/sidebar.tsx`**

Localizar a linha que monta o nav com os extras de admin (onde "Usuários" é adicionado quando `isAdmin`). Ela é parecida com:
```tsx
  const nav = isAdmin ? [...NAV, { href: '/config/usuarios', label: 'Usuários' }] : NAV
```
Trocar por:
```tsx
  const nav = isAdmin
    ? [...NAV, { href: '/master-data', label: 'Master Data' }, { href: '/config/usuarios', label: 'Usuários' }]
    : NAV
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build OK; rota `/master-data` aparece.

- [ ] **Step 5: Commit**

```bash
git add src/components/master-data/master-data-table.tsx "src/app/(dashboard)/master-data/page.tsx" src/components/sidebar.tsx
git commit -m "feat(master-data): tela /master-data (consultar/excluir cadastros) + item no sidebar" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Resiliência de deploy (auto-reload em erro de chunk)

**Files:**
- Create: `src/components/chunk-reload-guard.tsx`
- Create: `src/app/(dashboard)/error.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Criar `src/components/chunk-reload-guard.tsx`**

```tsx
'use client'

import { useEffect } from 'react'

// Após um deploy, abas abertas podem buscar chunks/assets do build antigo (hash
// que deixou de existir) → erro de carregamento. Aqui detectamos isso e
// recarregamos UMA vez (throttle de 10s evita loop) para pegar o build novo.
const CHUNK_RE = /ChunkLoadError|Loading chunk|dynamically imported module|module script failed|Failed to fetch/i

export function ChunkReloadGuard() {
  useEffect(() => {
    function recarregarUmaVez() {
      const KEY = 'chunk-reload-ts'
      const last = Number(sessionStorage.getItem(KEY) || '0')
      if (Date.now() - last < 10000) return
      sessionStorage.setItem(KEY, String(Date.now()))
      window.location.reload()
    }
    function ehChunk(msg?: string) { return !!msg && CHUNK_RE.test(msg) }
    function onError(e: ErrorEvent) {
      if (ehChunk(e.message) || ehChunk((e.error as Error | undefined)?.message)) recarregarUmaVez()
    }
    function onRejection(e: PromiseRejectionEvent) {
      const r = e.reason as unknown
      const msg = typeof r === 'string' ? r : (r as Error | undefined)?.message
      if (ehChunk(msg)) recarregarUmaVez()
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
```

- [ ] **Step 2: Montar no root layout — `src/app/layout.tsx`**

Adicionar o import no topo:
```tsx
import { ChunkReloadGuard } from '@/components/chunk-reload-guard'
```
Dentro do `<body ...>`, logo após a abertura (antes de `{children}`), adicionar:
```tsx
        <ChunkReloadGuard />
```

- [ ] **Step 3: Criar `src/app/(dashboard)/error.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

const CHUNK_RE = /ChunkLoadError|Loading chunk|dynamically imported module|module script failed/i

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Erro de chunk/asset velho após deploy → recarrega uma vez para pegar o build novo.
    if (CHUNK_RE.test(error.message || '')) {
      const KEY = 'dash-chunk-reload'
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1')
        window.location.reload()
      }
    }
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h2 className="text-xl font-semibold">Não foi possível carregar esta tela</h2>
      <p className="text-sm text-muted-foreground">Pode ser uma atualização recente do sistema. Tente recarregar.</p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>Recarregar</Button>
        <Button variant="outline" onClick={() => reset()}>Tentar de novo</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build OK (sem erros de tipo no layout/guard/error boundary).

- [ ] **Step 5: Commit**

```bash
git add src/components/chunk-reload-guard.tsx "src/app/(dashboard)/error.tsx" src/app/layout.tsx
git commit -m "feat(ux): auto-reload em erro de chunk pós-deploy + error boundary do dashboard" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verificação final

- [ ] **Step 1: Suíte unitária**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 2: Teste de integração novo**

Run: `npx vitest run tests/integration/master-data.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build OK; rota `/master-data` presente.

- [ ] **Step 4: Verificação manual (skill `run`)**

`npm run dev` → admin →
1. `/master-data`: alternar entidades (Clientes, Fornecedores, …), buscar por nome, "Novo"/"Editar" abrem as telas certas; excluir um cadastro **sem** vínculos funciona; excluir um **com** vínculo (ex.: cliente com projeto/contrato) mostra a mensagem "há registros vinculados".
2. Sidebar mostra "Master Data" só para admin.

---

## Notas

- Exclusão é **admin-only**, **auditada** e **FK-safe** (erro 23503 → mensagem amigável; nada é apagado).
- Registry é **allowlist fixa** — `listarEntidade`/`excluirEntidade` só operam nas 8 tabelas declaradas (sem tabela arbitrária / sem SQL dinâmico).
- `categorias` não tem tela de criar/editar própria hoje → no master data aparece só com consultar/excluir (sem botões Novo/Editar). Aceitável; criar tela de categoria fica fora deste escopo.
- A resiliência cobre o "This page couldn't load" pós-deploy: o guard recarrega em erro de chunk; o `error.tsx` dá um fallback amigável (em vez da tela crua) e também auto-recarrega em erro de chunk.
