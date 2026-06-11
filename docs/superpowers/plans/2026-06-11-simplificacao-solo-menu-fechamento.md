# Simplificação solo: menu agrupado + Fechamento do mês — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Para um operador solo, reduzir a superfície operacional: (1) menu agrupado (Dia a dia / Mensal / Config) com seção "Avançado" recolhível escondendo Copiloto/Conciliação/Alertas; (2) uma página `/fechamento` (checklist + botões Gerar AR/AP + status ao vivo) que concentra a rotina mensal.

**Architecture:** A geração de AP hoje vive inline no cron `/api/cron/gerar-ap`. Extraímos `gerarAPMes(refMonth)` para `src/modules/contas-pagar/ap.ts` (espelhando `gerarARMes`), e tanto o cron quanto o botão de AP do fechamento passam a chamá-la (DRY). A página `/fechamento` é um Server Component com duas server actions gated por papel (admin/financeiro, padrão do projeto) + status ao vivo via `count`. O menu vira grupos com headers; "Avançado" usa `useState` (recolhido por padrão), mantendo o badge de alertas visível mesmo recolhido.

**Tech Stack:** Next.js 16 (Server Components, Server Actions, route handlers), Supabase (service + cookie clients), Vitest. **Antes de escrever código Next, consultar `node_modules/next/dist/docs/` conforme AGENTS.md.**

**Pré-requisitos de teste:** `supabase start` rodando; `SUPABASE_SERVICE_ROLE_KEY` (local) em `.env.local`.

**Ordem (mantém `master` coerente após cada commit):** Task 1 (sem mudança visível) → Task 2 (página existe, ainda não linkada) → Task 3 (menu passa a linkar a página que já existe) → Task 4 (verificação).

---

## File Structure

**Criar:**
- `src/modules/contas-pagar/ap.ts` → adicionar `gerarAPMes` (modificar arquivo existente).
- `tests/integration/gerar-ap-mes.test.ts` — teste de `gerarAPMes`.
- `src/components/gerar-mes-button.tsx` — botão genérico (AR e AP) com seletor de mês + resultado.
- `src/app/(dashboard)/fechamento/page.tsx` — página de fechamento.

**Modificar:**
- `src/app/api/cron/gerar-ap/route.ts` — passa a chamar `gerarAPMes`.
- `src/components/sidebar.tsx` — menu agrupado + "Avançado" recolhível + item Fechamento.

---

## Task 1: Extrair `gerarAPMes` + refatorar o cron de AP

**Files:**
- Modify: `src/modules/contas-pagar/ap.ts`
- Modify: `src/app/api/cron/gerar-ap/route.ts`
- Test: `tests/integration/gerar-ap-mes.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/integration/gerar-ap-mes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { gerarAPMes } from '@/modules/contas-pagar/ap'

// gerarAPMes usa createServiceClient (lê estas envs) — forçar LOCAL
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'

const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function admin() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

describe('gerarAPMes', () => {
  let fornecedorId: string
  let categoriaId: string
  beforeEach(async () => {
    const d = admin()
    const { data: f } = await d.from('fornecedores')
      .insert({ nome: `Forn-${Date.now()}-${Math.floor(Math.random() * 1e6)}` })
      .select().single()
    fornecedorId = f!.id
    const { data: c } = await d.from('categorias').select('id').eq('nome', 'Cloud').single()
    categoriaId = c!.id
  })

  it('gera AP de recorrente ativa e é idempotente', async () => {
    const d = admin()
    await d.from('despesas_recorrentes').insert({
      fornecedor_id: fornecedorId, descricao: `Rec-${Date.now()}`, valor: 500,
      dia_mes: 10, categoria_id: categoriaId, data_inicio: '2026-04-01',
      proxima_geracao: '2026-05-01', ativa: true,
    })

    const r1 = await gerarAPMes('2026-05-01')
    expect(r1.inserted).toBeGreaterThanOrEqual(1)

    // idempotente: segunda chamada não duplica
    const r2 = await gerarAPMes('2026-05-01')
    expect(r2.inserted).toBe(0)
    expect(r2.skipped).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/integration/gerar-ap-mes.test.ts`
Expected: FAIL — `gerarAPMes` ainda não é exportada por `@/modules/contas-pagar/ap`.

- [ ] **Step 3: Adicionar `gerarAPMes` em `src/modules/contas-pagar/ap.ts`**

No topo do arquivo, adicionar os imports (junto aos existentes):
```ts
import { gerarAPDeRecorrente, proximaGeracao } from './gerador'
import type { DespesaRecorrente } from '@/lib/schemas/despesa_recorrente'
```
(`createServiceClient` já está importado e usado em `inserirAPBatch`.)

Adicionar a função ao final do arquivo:
```ts
/**
 * Gera AP (status 'previsto') do mês de referência para TODAS as despesas
 * recorrentes ativas, pulando as que já existem (dedup via índice único).
 * Atualiza `proxima_geracao` das que geraram. Compartilhado pelo cron mensal
 * e pelo botão "Gerar AP" do Fechamento. `refMonth` = "YYYY-MM-01".
 */
export async function gerarAPMes(refMonth: string) {
  const admin = createServiceClient()
  const { data: recorrentes, error } = await admin
    .from('despesas_recorrentes')
    .select('*')
    .eq('ativa', true)
  if (error) throw new Error(`gerarAPMes: ${error.message}`)

  const recs = recorrentes as DespesaRecorrente[]
  const novos = recs
    .map((r) => gerarAPDeRecorrente(r, refMonth))
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const result = await inserirAPBatch(novos)

  // Atualiza proxima_geracao das recorrentes que geraram AP neste mês
  for (const r of recs) {
    if (gerarAPDeRecorrente(r, refMonth) !== null) {
      const next = proximaGeracao(refMonth, r.dia_mes)
      await admin.from('despesas_recorrentes').update({ proxima_geracao: next }).eq('id', r.id)
    }
  }

  return { refMonth, recorrentes_ativas: recs.length, ...result }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/gerar-ap-mes.test.ts`
Expected: PASS (2 asserts: insere ≥1 e é idempotente).

- [ ] **Step 5: Refatorar o cron `src/app/api/cron/gerar-ap/route.ts` para usar `gerarAPMes`**

Substituir TODO o conteúdo do arquivo por:
```ts
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { gerarAPMes } from '@/modules/contas-pagar/ap'

export async function POST(request: NextRequest) {
  const naoAutorizado = requireCronAuth(request)
  if (naoAutorizado) return naoAutorizado

  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month')
  const refMonth = monthParam ?? new Date().toISOString().slice(0, 7) + '-01'

  try {
    const result = await gerarAPMes(refMonth)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}
```

- [ ] **Step 6: Build (garante que os imports antes usados pelo cron não quebraram nada)**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add src/modules/contas-pagar/ap.ts src/app/api/cron/gerar-ap/route.ts tests/integration/gerar-ap-mes.test.ts
git commit -m "refactor(ap): extrai gerarAPMes (cron + botão compartilham); teste" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Página `/fechamento` (checklist + botões + status ao vivo)

**Files:**
- Create: `src/components/gerar-mes-button.tsx`
- Create: `src/app/(dashboard)/fechamento/page.tsx`

- [ ] **Step 1: Botão genérico `src/components/gerar-mes-button.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export type GerarMesResult = { inserted: number; skipped: number } & Record<string, unknown>

function mesAtual(): string {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

export function GerarMesButton({
  id,
  label,
  pendingLabel,
  onGerar,
  formatMsg,
}: {
  id: string
  label: string
  pendingLabel: string
  onGerar: (month: string) => Promise<GerarMesResult>
  formatMsg: (r: GerarMesResult) => string
}) {
  const router = useRouter()
  const [month, setMonth] = useState(mesAtual())
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function handle() {
    setErr(null)
    setMsg(null)
    start(async () => {
      try {
        const r = await onGerar(month)
        setMsg(formatMsg(r))
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao gerar')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label htmlFor={id} className="block text-xs text-muted-foreground">Mês de referência</label>
        <input
          id={id}
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-border rounded-md px-2 py-1 text-sm bg-background"
        />
      </div>
      <Button type="button" onClick={handle} disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      {msg && <span className="text-sm text-emerald-400">{msg}</span>}
      {err && <span className="text-sm text-destructive">{err}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Página `src/app/(dashboard)/fechamento/page.tsx`**

```tsx
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { withAudit } from '@/lib/audit'
import { gerarARMes } from '@/modules/contas-receber/ar'
import { gerarAPMes } from '@/modules/contas-pagar/ap'
import { GerarMesButton, type GerarMesResult } from '@/components/gerar-mes-button'

function fmtBRL(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function FechamentoPage() {
  const supabase = await createClient()

  const mes = new Date().toISOString().slice(0, 7) // YYYY-MM (mês atual)
  const inicio = `${mes}-01`
  const [y, m] = mes.split('-').map(Number)
  const fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) // último dia do mês

  // Status ao vivo (mês corrente)
  const [pend, ar, ap] = await Promise.all([
    supabase.from('lancamentos').select('id', { count: 'exact', head: true })
      .or('categoria_id.is.null,and(categorizacao_metodo.eq.llm,categorizacao_confianca.lt.0.7)'),
    supabase.from('contas_a_receber').select('valor', { count: 'exact' })
      .gte('data_vencimento', inicio).lte('data_vencimento', fim)
      .in('status', ['previsto', 'emitido', 'atrasado']),
    supabase.from('contas_a_pagar').select('valor', { count: 'exact' })
      .gte('data_vencimento', inicio).lte('data_vencimento', fim)
      .in('status', ['previsto', 'aprovado', 'atrasado']),
  ])

  const pendCount = pend.count ?? 0
  const arCount = ar.count ?? 0
  const arTotal = (ar.data ?? []).reduce((s, r) => s + Number(r.valor), 0)
  const apCount = ap.count ?? 0
  const apTotal = (ap.data ?? []).reduce((s, r) => s + Number(r.valor), 0)

  async function gerarARAction(month: string): Promise<GerarMesResult> {
    'use server'
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('mês inválido')
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) throw new Error('não autenticado')
    const { data: u } = await sb.from('usuarios').select('role').eq('id', user.id).single()
    if (!u || !['admin', 'financeiro'].includes(u.role)) throw new Error('sem permissão para gerar AR')
    const refMonth = `${month}-01`
    const result = await withAudit(
      { usuario_id: user.id, acao: 'custom', tabela: 'contas_a_receber', registro_id: refMonth,
        before: null, after: { mes_ref: refMonth }, motivo: 'gerar AR do mês (fechamento)' },
      async () => gerarARMes(refMonth),
    )
    revalidatePath('/fechamento')
    revalidatePath('/contas-receber')
    return result
  }

  async function gerarAPAction(month: string): Promise<GerarMesResult> {
    'use server'
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('mês inválido')
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) throw new Error('não autenticado')
    const { data: u } = await sb.from('usuarios').select('role').eq('id', user.id).single()
    if (!u || !['admin', 'financeiro'].includes(u.role)) throw new Error('sem permissão para gerar AP')
    const refMonth = `${month}-01`
    const result = await withAudit(
      { usuario_id: user.id, acao: 'custom', tabela: 'contas_a_pagar', registro_id: refMonth,
        before: null, after: { mes_ref: refMonth }, motivo: 'gerar AP do mês (fechamento)' },
      async () => gerarAPMes(refMonth),
    )
    revalidatePath('/fechamento')
    revalidatePath('/contas-pagar')
    return result
  }

  const passos = [
    { n: 2, titulo: 'Registrar recebimentos', desc: 'Marque como recebido o que entrou.', href: '/contas-receber', cta: 'Contas a Receber' },
    { n: 3, titulo: 'Registrar pagamentos', desc: 'Aprove e marque como pago o que saiu.', href: '/contas-pagar', cta: 'Contas a Pagar' },
    { n: 4, titulo: 'Resolver pendências', desc: pendCount > 0 ? `${pendCount} lançamento(s) sem categoria.` : 'Tudo categorizado.', href: '/pendencias', cta: 'Pendências' },
    { n: 5, titulo: 'Conferir DRE e fluxo', desc: 'Resultado do mês e caixa.', href: '/relatorios', cta: 'Relatórios' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fechamento do mês</h1>
        <p className="text-sm text-muted-foreground">Rotina mensal em uma tela — referência: {mes}</p>
      </div>

      {/* Status ao vivo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">A receber no mês</div>
          <div className="mt-1 text-lg font-semibold">{fmtBRL(arTotal)}</div>
          <div className="text-xs text-muted-foreground">{arCount} conta(s)</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">A pagar no mês</div>
          <div className="mt-1 text-lg font-semibold">{fmtBRL(apTotal)}</div>
          <div className="text-xs text-muted-foreground">{apCount} conta(s)</div>
        </div>
        <div className={'rounded-lg border p-4 ' + (pendCount > 0 ? 'border-amber-400/40 bg-amber-400/10' : 'border-border bg-card')}>
          <div className="text-xs text-muted-foreground">Pendências de categorização</div>
          <div className="mt-1 text-lg font-semibold">{pendCount}</div>
          <div className="text-xs text-muted-foreground">{pendCount > 0 ? 'precisa de revisão' : 'tudo certo'}</div>
        </div>
      </div>

      {/* Passo 1: gerar previstos */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div>
          <div className="text-sm font-semibold">1 · Gerar previstos do mês</div>
          <p className="text-sm text-muted-foreground">
            AR dos contratos ativos e AP das despesas recorrentes. Idempotente — não duplica o que já existe.
          </p>
        </div>
        <GerarMesButton
          id="fechamento-ar"
          label="Gerar AR do mês"
          pendingLabel="Gerando AR..."
          onGerar={gerarARAction}
          formatMsg={(r) => `${r.inserted} AR gerada(s), ${r.skipped} já existia(m).`}
        />
        <GerarMesButton
          id="fechamento-ap"
          label="Gerar AP do mês"
          pendingLabel="Gerando AP..."
          onGerar={gerarAPAction}
          formatMsg={(r) => `${r.inserted} AP gerada(s), ${r.skipped} já existia(m).`}
        />
      </div>

      {/* Passos 2..5: atalhos */}
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {passos.map((p) => (
          <div key={p.n} className="flex items-center justify-between gap-4 p-4">
            <div>
              <div className="text-sm font-semibold">{p.n} · {p.titulo}</div>
              <p className="text-sm text-muted-foreground">{p.desc}</p>
            </div>
            <Link
              href={p.href}
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-primary hover:bg-accent"
            >
              {p.cta}
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build OK; rota `/fechamento` aparece na saída.

- [ ] **Step 4: Commit**

```bash
git add src/components/gerar-mes-button.tsx "src/app/(dashboard)/fechamento/page.tsx"
git commit -m "feat(fechamento): pagina /fechamento (checklist + gerar AR/AP + status ao vivo)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Menu agrupado + "Avançado" recolhível + item Fechamento

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Reescrever `src/components/sidebar.tsx`**

Substituir TODO o conteúdo do arquivo por:
```tsx
'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/brand-logo'

type Item = { href: string; label: string }

const DIA_A_DIA: Item[] = [
  { href: '/',               label: 'Dashboard' },
  { href: '/receitas',       label: 'Receitas' },
  { href: '/contas-receber', label: 'Contas a Receber' },
  { href: '/despesas',       label: 'Despesas' },
  { href: '/contas-pagar',   label: 'Contas a Pagar' },
  { href: '/pendencias',     label: 'Pendências' },
]

const MENSAL: Item[] = [
  { href: '/fechamento',  label: 'Fechamento do mês' },
  { href: '/folha',       label: 'Folha de Pagamento' },
  { href: '/fluxo-caixa', label: 'Fluxo de Caixa' },
  { href: '/relatorios',  label: 'Relatórios' },
  { href: '/forecast',    label: 'Forecast' },
]

const AVANCADO: Item[] = [
  { href: '/copiloto',    label: 'Copiloto' },
  { href: '/conciliacao', label: 'Conciliação' },
  { href: '/alertas',     label: 'Alertas' },
]

export function Sidebar({ alertasUnread = 0, isAdmin = false }: { alertasUnread?: number; isAdmin?: boolean }) {
  const pathname = usePathname()
  const [avancadoAberto, setAvancadoAberto] = useState(false)

  const config: Item[] = isAdmin
    ? [
        { href: '/config',          label: 'Configurações' },
        { href: '/master-data',     label: 'Master Data' },
        { href: '/config/usuarios', label: 'Usuários' },
      ]
    : [{ href: '/config', label: 'Configurações' }]

  function GroupLabel({ children }: { children: ReactNode }) {
    return (
      <div className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </div>
    )
  }

  function renderItem(item: Item) {
    const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
    return (
      <Link
        key={item.href}
        href={item.href}
        className={
          'px-3 py-2 rounded-md text-sm transition-colors flex items-center border-l-2 ' +
          (active
            ? 'border-primary bg-primary/10 text-primary font-semibold'
            : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground')
        }
      >
        {item.label}
        {item.href === '/alertas' && alertasUnread > 0 ? (
          <span className="ml-2 inline-block min-w-[20px] text-center bg-rose-500 text-white text-xs rounded-full px-1.5 py-0.5">
            {alertasUnread > 99 ? '99+' : alertasUnread}
          </span>
        ) : null}
      </Link>
    )
  }

  return (
    <aside className="w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground min-h-screen p-4">
      <div className="mb-1 px-2 pt-1">
        <BrandLogo size={26} />
      </div>
      <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        Gestão Financeira
      </div>
      <nav className="flex flex-col gap-1">
        <GroupLabel>Dia a dia</GroupLabel>
        {DIA_A_DIA.map(renderItem)}

        <GroupLabel>Mensal</GroupLabel>
        {MENSAL.map(renderItem)}

        <GroupLabel>Config</GroupLabel>
        {config.map(renderItem)}

        <button
          type="button"
          onClick={() => setAvancadoAberto((v) => !v)}
          className="mt-4 flex items-center justify-between px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          <span>Avançado</span>
          <span className="flex items-center gap-1">
            {!avancadoAberto && alertasUnread > 0 ? (
              <span className="inline-block min-w-[18px] text-center bg-rose-500 text-white text-[10px] rounded-full px-1 py-0.5">
                {alertasUnread > 99 ? '99+' : alertasUnread}
              </span>
            ) : null}
            <span aria-hidden>{avancadoAberto ? '▾' : '▸'}</span>
          </span>
        </button>
        {avancadoAberto && AVANCADO.map(renderItem)}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(ux): menu agrupado (Dia a dia/Mensal/Config) + Avancado recolhivel + Fechamento" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verificação final

- [ ] **Step 1: Suíte unitária**

Run: `npm run test:unit`
Expected: PASS (sem regressão).

- [ ] **Step 2: Integração — gerarAPMes**

Run: `npx vitest run tests/integration/gerar-ap-mes.test.ts`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build OK; rota `/fechamento` listada.

---

## Notas

- **DRY:** `gerarAPMes` é a única fonte de geração de AP (cron + botão). `gerarARMes` já existia e é reusada pelo botão de AR.
- **Segurança:** as duas server actions do Fechamento repetem o gate de papel (admin/financeiro) já usado em `/contas-receber`; nada novo exposto.
- **Coerência do menu:** "Avançado" recolhido por padrão mostra o badge de alertas não-lidos no header, para não esconder pendência de alerta.
- **Verificação visual logada** (login necessário) fica para o controlador após o merge — não bloqueia as tasks.
