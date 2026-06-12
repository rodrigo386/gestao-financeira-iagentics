# Slack Fase 1 — notificações outbound (alertas + resumo diário + confirmação de jobs) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar 3 fluxos de notificação ao Slack via Incoming Webhook (outbound): (A1) alertas warning/critical, (A2) resumo diário "ação de hoje", (A3) confirmação das gerações mensais AR/AP. Slack substitui o e-mail (Resend fica em mock).

**Architecture:** Um provider `src/lib/slack/client.ts` espelhando `src/lib/email/client.ts` — `SLACK_MODE` (mock|real) + `SLACK_WEBHOOK_URL`, com builder puro `buildSlackPayload` (Block Kit, cor por severidade) testável sem rede. A1 pluga `postSlack` em `notificador.ts` (best-effort, ao lado do e-mail que continua em mock). A2 é um módulo `montarResumoDiario(hoje)` (service client) + um cron route que formata e posta. A3 adiciona um `postSlack` best-effort nos crons gerar-ar/gerar-ap. Todas as chamadas Slack são best-effort (try/catch) — nunca quebram o fluxo principal.

**Tech Stack:** Next.js 16 (route handlers), Supabase (service client), Vitest, `fetch` global (Node 20+). **Antes de escrever código Next, consultar `node_modules/next/dist/docs/` conforme AGENTS.md** — porém as mudanças aqui espelham arquivos existentes do repo.

**Pré-requisitos de teste:** `supabase start` rodando; `SUPABASE_SERVICE_ROLE_KEY` (local) em `.env.local`.

**Ordem (mantém `master` coerente; provider antes dos consumidores):** Task 1 (provider) → Task 2 (A1) → Task 3 (A2) → Task 4 (A3) → Task 5 (verificação).

---

## File Structure

**Criar:**
- `src/lib/slack/client.ts` — `postSlack` + `buildSlackPayload` + `colorOf` (provider).
- `tests/unit/lib/slack/payload.test.ts` — unit do builder puro.
- `src/modules/alertas/resumo-diario.ts` — `montarResumoDiario(hoje)`.
- `src/app/api/cron/resumo-diario/route.ts` — cron que monta e posta o resumo.
- `tests/integration/resumo-diario.test.ts` — integração do resumo.

**Modificar:**
- `src/modules/alertas/notificador.ts` — postar alerta no Slack (A1).
- `src/app/api/cron/gerar-ar/route.ts` e `.../gerar-ap/route.ts` — confirmação (A3).
- `.env.example` — documentar `SLACK_MODE` / `SLACK_WEBHOOK_URL`.

---

## Task 1: Provider Slack + unit do payload + .env.example

**Files:**
- Create: `src/lib/slack/client.ts`
- Test: `tests/unit/lib/slack/payload.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Escrever o teste que falha** — `tests/unit/lib/slack/payload.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { buildSlackPayload, colorOf } from '@/lib/slack/client'

describe('buildSlackPayload', () => {
  it('usa cor por severidade e inclui título e mensagem', () => {
    const p = buildSlackPayload({ titulo: 'Saldo baixo', mensagem: 'Conta X', severidade: 'warning' })
    expect(p.attachments[0].color).toBe('#c80')
    const blocks = p.attachments[0].blocks as Array<Record<string, any>>
    expect(blocks[0].type).toBe('header')
    expect(blocks[0].text.text).toBe('Saldo baixo')
    expect(blocks[1].text.text).toBe('Conta X')
  })

  it('inclui linhas e contexto quando fornecidos', () => {
    const p = buildSlackPayload({
      titulo: 'Resumo', mensagem: 'Hoje', linhas: ['linha A', 'linha B'], contexto: { x: 1 },
    })
    const blocks = p.attachments[0].blocks as Array<Record<string, any>>
    const texts = blocks.map((b) => JSON.stringify(b))
    expect(texts.some((t) => t.includes('linha A'))).toBe(true)
    expect(texts.some((t) => t.includes('"x":1'))).toBe(true)
  })

  it('default severidade info → cor azul', () => {
    expect(colorOf('info')).toBe('#06c')
    const p = buildSlackPayload({ titulo: 'X', mensagem: 'Y' })
    expect(p.attachments[0].color).toBe('#06c')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/unit/lib/slack/payload.test.ts`
Expected: FAIL — módulo `@/lib/slack/client` não existe.

- [ ] **Step 3: Criar `src/lib/slack/client.ts`**

```ts
import 'server-only'

export type SlackSeveridade = 'info' | 'warning' | 'critical'

export type SlackInput = {
  titulo: string
  mensagem: string
  severidade?: SlackSeveridade
  linhas?: string[]
  contexto?: Record<string, unknown>
}

export function colorOf(s: SlackSeveridade): string {
  return s === 'critical' ? '#c00' : s === 'warning' ? '#c80' : '#06c'
}

/** Monta o payload Block Kit (Incoming Webhook) — função pura, testável sem rede. */
export function buildSlackPayload(input: SlackInput) {
  const sev = input.severidade ?? 'info'
  const blocks: Record<string, unknown>[] = [
    { type: 'header', text: { type: 'plain_text', text: input.titulo.slice(0, 150) } },
    { type: 'section', text: { type: 'mrkdwn', text: input.mensagem } },
  ]
  if (input.linhas && input.linhas.length > 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: input.linhas.join('\n') } })
  }
  if (input.contexto) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '```' + JSON.stringify(input.contexto) + '```' }],
    })
  }
  return { attachments: [{ color: colorOf(sev), blocks }] }
}

/**
 * Posta no Slack via Incoming Webhook. Mock (default) é no-op. Real exige
 * SLACK_WEBHOOK_URL. Espelha o provider de e-mail (SLACK_MODE mock|real).
 */
export async function postSlack(input: SlackInput): Promise<{ ok: boolean; mock?: boolean }> {
  if (process.env.SLACK_MODE !== 'real') {
    return { ok: true, mock: true }
  }
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) throw new Error('SLACK_WEBHOOK_URL required when SLACK_MODE=real')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildSlackPayload(input)),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Slack webhook ${res.status}: ${body.slice(0, 200)}`)
  }
  return { ok: true }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/unit/lib/slack/payload.test.ts`
Expected: PASS (3 casos).

- [ ] **Step 5: Documentar envs no `.env.example`**

Adicionar ao FINAL de `.env.example`:
```bash

# Slack (notificações outbound — Fase 1). mock = no-op; real exige SLACK_WEBHOOK_URL.
SLACK_MODE=mock
SLACK_WEBHOOK_URL=
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/slack/client.ts tests/unit/lib/slack/payload.test.ts .env.example
git commit -m "feat(slack): provider postSlack/buildSlackPayload (webhook, mock-first)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: A1 — Alertas no Slack (notificador)

**Files:**
- Modify: `src/modules/alertas/notificador.ts`

- [ ] **Step 1: Adicionar import**

No topo de `src/modules/alertas/notificador.ts`, junto aos imports:
```ts
import { postSlack } from '@/lib/slack/client'
```

- [ ] **Step 2: Postar no Slack para warning/critical**

Localizar o bloco existente:
```ts
  // Email if warning/critical
  if (input.severidade === 'warning' || input.severidade === 'critical') {
    try {
      await sendAlertaEmail({
        subject: `[${input.severidade.toUpperCase()}] ${input.titulo}`,
        severidade: input.severidade,
        titulo: input.titulo,
        mensagem: input.mensagem,
        contexto_json: input.contexto_json,
      })
    } catch (e) {
      console.error('alerta email failed (continuing):', e)
    }
  }
```
e substituir por (adiciona o Slack ANTES do e-mail; ambos best-effort):
```ts
  // Notifica canais se warning/critical (Slack é o canal real; e-mail fica em mock)
  if (input.severidade === 'warning' || input.severidade === 'critical') {
    try {
      await postSlack({
        titulo: input.titulo,
        mensagem: input.mensagem,
        severidade: input.severidade,
        contexto: input.contexto_json,
      })
    } catch (e) {
      console.error('alerta slack failed (continuing):', e)
    }
    try {
      await sendAlertaEmail({
        subject: `[${input.severidade.toUpperCase()}] ${input.titulo}`,
        severidade: input.severidade,
        titulo: input.titulo,
        mensagem: input.mensagem,
        contexto_json: input.contexto_json,
      })
    } catch (e) {
      console.error('alerta email failed (continuing):', e)
    }
  }
```

- [ ] **Step 3: Build + suíte unitária (não deve regredir)**

Run: `npm run build`
Expected: build OK.
Run: `npm run test:unit`
Expected: PASS (nenhuma regressão; `postSlack` em mock é no-op).

- [ ] **Step 4: Commit**

```bash
git add src/modules/alertas/notificador.ts
git commit -m "feat(slack): alertas warning/critical postam no Slack (A1)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: A2 — Resumo diário "ação de hoje" + cron

**Files:**
- Create: `src/modules/alertas/resumo-diario.ts`
- Create: `src/app/api/cron/resumo-diario/route.ts`
- Test: `tests/integration/resumo-diario.test.ts`

- [ ] **Step 1: Escrever o teste que falha** — `tests/integration/resumo-diario.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { montarResumoDiario } from '@/modules/alertas/resumo-diario'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
function admin() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

describe('montarResumoDiario', () => {
  let clienteId: string
  beforeEach(async () => {
    const d = admin()
    const { data: c } = await d.from('clientes')
      .insert({ nome: `Cli-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, status: 'ativo' })
      .select().single()
    clienteId = c!.id
  })

  it('conta AR/AP vencendo hoje e atrasados', async () => {
    const d = admin()
    const HOJE = '2026-09-15'
    const ANTES = '2026-09-01'

    // AR vencendo hoje + AR atrasada (origem 'avulso' dispensa origem_id)
    await d.from('contas_a_receber').insert({
      cliente_id: clienteId, origem: 'avulso', valor: 1000, moeda: 'BRL',
      data_emissao: '2026-09-01', data_vencimento: HOJE, status: 'previsto',
    })
    await d.from('contas_a_receber').insert({
      cliente_id: clienteId, origem: 'avulso', valor: 700, moeda: 'BRL',
      data_emissao: '2026-08-01', data_vencimento: ANTES, status: 'previsto',
    })
    // AP vencendo hoje
    await d.from('contas_a_pagar').insert({
      tipo_credor: 'fornecedor', origem: 'avulso', descricao: `AP-${Date.now()}`,
      valor: 300, moeda: 'BRL', data_vencimento: HOJE, status: 'previsto',
    })

    const r = await montarResumoDiario(HOJE)
    expect(r.arHoje.count).toBeGreaterThanOrEqual(1)
    expect(r.arHoje.total).toBeGreaterThanOrEqual(1000)
    expect(r.arAtrasado.count).toBeGreaterThanOrEqual(1)
    expect(r.apHoje.count).toBeGreaterThanOrEqual(1)
    expect(typeof r.pendencias).toBe('number')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/integration/resumo-diario.test.ts`
Expected: FAIL — `montarResumoDiario` não existe.

- [ ] **Step 3: Criar `src/modules/alertas/resumo-diario.ts`**

(Sem `import 'server-only'` — espelha `ar.ts`, que é testado em integração; só os route handlers carregam `server-only`.)
```ts
import { createServiceClient } from '@/lib/supabase/service'

type Bucket = { count: number; total: number }

export type ResumoDiario = {
  hoje: string
  arHoje: Bucket
  arAtrasado: Bucket
  apHoje: Bucket
  apAtrasado: Bucket
  pendencias: number
}

/**
 * "Ação de hoje": a receber / a pagar vencendo hoje + atrasados, e pendências de
 * categorização. Usa service client (contexto de cron, sem cookies).
 */
export async function montarResumoDiario(hoje: string): Promise<ResumoDiario> {
  const admin = createServiceClient()
  const AR_ABERTO = ['previsto', 'emitido', 'atrasado']
  const AP_ABERTO = ['previsto', 'aprovado', 'atrasado']

  const bucket = (data: { valor: number }[] | null, count: number | null): Bucket => ({
    count: count ?? 0,
    total: (data ?? []).reduce((s, r) => s + Number(r.valor), 0),
  })

  const [arH, arA, apH, apA, pend] = await Promise.all([
    admin.from('contas_a_receber').select('valor', { count: 'exact' }).eq('data_vencimento', hoje).in('status', AR_ABERTO),
    admin.from('contas_a_receber').select('valor', { count: 'exact' }).lt('data_vencimento', hoje).in('status', AR_ABERTO),
    admin.from('contas_a_pagar').select('valor', { count: 'exact' }).eq('data_vencimento', hoje).in('status', AP_ABERTO),
    admin.from('contas_a_pagar').select('valor', { count: 'exact' }).lt('data_vencimento', hoje).in('status', AP_ABERTO),
    admin.from('lancamentos').select('id', { count: 'exact', head: true })
      .or('categoria_id.is.null,and(categorizacao_metodo.eq.llm,categorizacao_confianca.lt.0.7)'),
  ])

  return {
    hoje,
    arHoje: bucket(arH.data as { valor: number }[] | null, arH.count),
    arAtrasado: bucket(arA.data as { valor: number }[] | null, arA.count),
    apHoje: bucket(apH.data as { valor: number }[] | null, apH.count),
    apAtrasado: bucket(apA.data as { valor: number }[] | null, apA.count),
    pendencias: pend.count ?? 0,
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/resumo-diario.test.ts`
Expected: PASS.

- [ ] **Step 5: Criar o cron `src/app/api/cron/resumo-diario/route.ts`**

```ts
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { montarResumoDiario } from '@/modules/alertas/resumo-diario'
import { postSlack } from '@/lib/slack/client'

function brl(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export async function POST(request: NextRequest) {
  const naoAutorizado = requireCronAuth(request)
  if (naoAutorizado) return naoAutorizado

  const hoje = new Date().toISOString().slice(0, 10)
  const r = await montarResumoDiario(hoje)

  const linhas = [
    `*A receber* — vencendo hoje: ${r.arHoje.count} (${brl(r.arHoje.total)}) · atrasado: ${r.arAtrasado.count} (${brl(r.arAtrasado.total)})`,
    `*A pagar* — vencendo hoje: ${r.apHoje.count} (${brl(r.apHoje.total)}) · atrasado: ${r.apAtrasado.count} (${brl(r.apAtrasado.total)})`,
    `*Pendências de categorização:* ${r.pendencias}`,
  ]

  try {
    await postSlack({ titulo: `Resumo do dia — ${hoje}`, mensagem: 'Ação de hoje', linhas, severidade: 'info' })
  } catch (e) {
    console.error('resumo-diario slack falhou (continuando):', e)
  }

  return NextResponse.json(r)
}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build OK; rota `/api/cron/resumo-diario` na saída.

- [ ] **Step 7: Commit**

```bash
git add src/modules/alertas/resumo-diario.ts "src/app/api/cron/resumo-diario" tests/integration/resumo-diario.test.ts
git commit -m "feat(slack): resumo diario 'acao de hoje' + cron resumo-diario (A2)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: A3 — Confirmação das gerações mensais AR/AP

**Files:**
- Modify: `src/app/api/cron/gerar-ar/route.ts`
- Modify: `src/app/api/cron/gerar-ap/route.ts`

- [ ] **Step 1: gerar-ar — postar confirmação**

Em `src/app/api/cron/gerar-ar/route.ts`, adicionar o import:
```ts
import { postSlack } from '@/lib/slack/client'
```
e dentro do `try`, entre `const result = await gerarARMes(refMonth)` e `return NextResponse.json(result)`, inserir:
```ts
    try {
      await postSlack({
        titulo: `Gerar AR — ${result.refMonth}`,
        mensagem: `${result.inserted} gerada(s), ${result.skipped} já existia(m) — ${result.contratos_ativos} contrato(s) ativo(s).`,
        severidade: 'info',
      })
    } catch (e) {
      console.error('gerar-ar slack falhou (continuando):', e)
    }
```

- [ ] **Step 2: gerar-ap — postar confirmação**

Em `src/app/api/cron/gerar-ap/route.ts`, adicionar o import:
```ts
import { postSlack } from '@/lib/slack/client'
```
e dentro do `try`, entre `const result = await gerarAPMes(refMonth)` e `return NextResponse.json(result)`, inserir:
```ts
    try {
      await postSlack({
        titulo: `Gerar AP — ${result.refMonth}`,
        mensagem: `${result.inserted} gerada(s), ${result.skipped} já existia(m) — ${result.recorrentes_ativas} recorrente(s) ativa(s).`,
        severidade: 'info',
      })
    } catch (e) {
      console.error('gerar-ap slack falhou (continuando):', e)
    }
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/cron/gerar-ar/route.ts" "src/app/api/cron/gerar-ap/route.ts"
git commit -m "feat(slack): confirmacao no Slack das geracoes mensais AR/AP (A3)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verificação final

- [ ] **Step 1: Suíte unitária** — Run: `npm run test:unit` — Expected: PASS (inclui `buildSlackPayload`).
- [ ] **Step 2: Integração resumo** — Run: `npx vitest run tests/integration/resumo-diario.test.ts` — Expected: PASS.
- [ ] **Step 3: Build** — Run: `npm run build` — Expected: build OK; rota `/api/cron/resumo-diario` listada.

---

## Notas

- **Best-effort:** toda chamada `postSlack` está em try/catch — se o Slack falhar, o alerta/persistência/geração continuam.
- **Slack substitui e-mail:** o caminho de e-mail (`sendAlertaEmail`) permanece no código mas em `RESEND_MODE=mock` (no-op). Reversível flipando a env.
- **Config do usuário (Railway):** `SLACK_MODE=real`, `SLACK_WEBHOOK_URL=…` (canal privado) e agendar `POST /api/cron/resumo-diario` (Bearer `CRON_SECRET`) no horário desejado.
- **Fora de escopo (Fase 2/3):** Copiloto no Slack, slash commands, botões de ação.
