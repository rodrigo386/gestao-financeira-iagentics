# Fase 4 — Bancos (Pluggy) + Categorização Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate bank transaction ingest via Pluggy (Open Finance), classify each `lancamento` via a 3-step cascade (regras → histórico → Claude Haiku LLM), and reconcile lançamentos against pending AP/AR using the break taxonomy from `anthropics/financial-services` (matched / timing-break / amount-break / mapping-issue / duplicate / bank-only / ledger-only). After this phase, daily sync runs, most expenses auto-categorize, and the user gets a "Pendências" queue for low-confidence items + a "Sugestões de conciliação" queue for unclear matches.

**Architecture:**
- **Mock-first development.** Both Pluggy and LLM run via mock providers behind interfaces. Env vars `PLUGGY_MODE=mock|real` and `LLM_MODE=mock|real` switch between them. CI uses mocks. Flipping to real Pluggy is just creds + env.
- **Security pattern (from `anthropics/financial-services`):** read-only orchestrator / write-only leaf. `src/lib/llm/` exposes pure functions (`classify`, `summarize`) that return Zod-validated JSON; never receives Supabase client; writes happen only in dedicated server handlers after validation.
- **Cascade:** regra match (cheap) → histórico (fornecedor já visto 3+ vezes) → Claude Haiku 4.5 (with prompt caching: system prompt + categoria list cached). Low confidence (<0.7) → `pendente_revisao` queue.
- **Conciliation:** scheduled job after sync. For each unconciled `lancamento` of `origem=pluggy`, find candidate AP (if saida) / AR (if entrada) by value (± R$ 0.01) + date window (±3d), score, classify into break taxonomy. Score ≥ 0.8 → auto-link, else queue.

**Tech Stack:** Same as Phase 3 + `@anthropic-ai/sdk` (LLM). Pluggy via plain `fetch` to their REST API (no SDK published).

**Out of scope** (deferred):
- Pluggy Connect widget (use API only — user connects via Pluggy dashboard or future UI in Phase 4.5)
- Multi-currency conversion
- Real-time webhooks (just daily cron for v1)
- LLM-driven contract extraction (`prompts/contratos/SKILL.md` — Phase 5 or after)
- Variance commentary (`prompts/commentary/SKILL.md` — Phase 5)
- Folha validation (`prompts/folha/SKILL.md` — Phase 5)

**Prerequisites:** Phase 3 complete on `master`, last commit `85d1256`. 20 migrations. 81 commits total.

---

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/0021_pluggy_items.sql` | Pluggy connection items linked to contas_bancarias |
| `supabase/migrations/0022_regras_categorizacao.sql` | Pattern-based categorization rules |
| `supabase/migrations/0023_sugestoes_conciliacao.sql` | Suggested AP/AR matches for unconciled lancamentos |
| `src/lib/llm/client.ts` | Anthropic SDK wrapper (read-only, with caching, mock mode) |
| `src/lib/llm/types.ts` | Zod schemas for LLM responses |
| `src/lib/schemas/regra.ts` | Zod |
| `src/lib/schemas/sugestao.ts` | Zod |
| `src/lib/schemas/pluggy-item.ts` | Zod |
| `src/modules/bancos/pluggy-client.ts` | Pluggy REST API wrapper (mock + real) |
| `src/modules/bancos/sync.ts` | Daily sync from Pluggy → lancamentos (TDD) |
| `src/modules/bancos/conciliacao.ts` | Break taxonomy classifier + auto-resolver (TDD) |
| `src/modules/categorizacao/regras.ts` | Rule-based matcher (TDD) |
| `src/modules/categorizacao/historico.ts` | History-based matcher (TDD) |
| `src/modules/categorizacao/cascata.ts` | Orchestrator: regras → historico → LLM |
| `prompts/categorizacao/SKILL.md` | Fill in body (was skeleton) |
| `prompts/reconciliacao/SKILL.md` | Fill in body |
| `src/app/api/cron/sync-pluggy/route.ts` | Daily Pluggy sync endpoint |
| `src/app/api/cron/categorizar-pendentes/route.ts` | Run cascade on uncategorized lancamentos |
| `src/app/api/cron/conciliar/route.ts` | Reconciliation pass |
| `src/app/(dashboard)/config/bancos/page.tsx` | List Pluggy items + connect button (links to Pluggy hosted UI for v1) |
| `src/app/(dashboard)/config/regras-categorizacao/` (3 pages) | CRUD for regras |
| `src/app/(dashboard)/pendencias/page.tsx` | Review queue: uncategorized lancamentos + low-confidence LLM suggestions |
| `src/app/(dashboard)/conciliacao/page.tsx` | Review queue: sugestões de conciliação |
| `tests/unit/modules/categorizacao/regras.test.ts` | Pattern matching tests |
| `tests/unit/modules/categorizacao/historico.test.ts` | History matching tests |
| `tests/unit/modules/categorizacao/cascata.test.ts` | Cascade orchestration tests |
| `tests/unit/modules/bancos/conciliacao.test.ts` | Scoring + break classification tests |
| `tests/integration/cascata-completa.test.ts` | Full cascade + DB persistence test |
| `tests/integration/conciliacao-auto.test.ts` | Auto-conciliation flow test |

---

## Tasks

### Task 1: Migration 0021 — pluggy_items

- [ ] **Step 1:** `supabase migration new pluggy_items && mv supabase/migrations/*_pluggy_items.sql supabase/migrations/0021_pluggy_items.sql`

- [ ] **Step 2:**

```sql
create type pluggy_item_status as enum ('updating', 'updated', 'login_error', 'waiting_user_input', 'outdated', 'error');

create table public.pluggy_items (
  id                  uuid primary key default gen_random_uuid(),
  pluggy_item_id      text not null unique,           -- Pluggy's item UUID
  conta_bancaria_id   uuid references public.contas_bancarias(id) on delete set null,
  banco_nome          text not null,
  status              pluggy_item_status not null default 'updating',
  last_synced_at      timestamptz,
  last_error          text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create index pluggy_items_conta on public.pluggy_items (conta_bancaria_id);
create index pluggy_items_status on public.pluggy_items (status);

create trigger pluggy_items_atualizado_em
  before update on public.pluggy_items
  for each row execute function public.tg_set_atualizado_em();

alter table public.pluggy_items enable row level security;

create policy "pluggy_items_select_authenticated"
  on public.pluggy_items for select to authenticated using (true);

create policy "pluggy_items_modify_admin"
  on public.pluggy_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit: `feat(db): add pluggy_items linking Pluggy connections to bank accounts`

---

### Task 2: Migration 0022 — regras_categorizacao

- [ ] **Step 1:** `supabase migration new regras_categorizacao && mv supabase/migrations/*_regras_categorizacao.sql supabase/migrations/0022_regras_categorizacao.sql`

- [ ] **Step 2:**

```sql
create type regra_pattern_tipo as enum ('contains', 'regex', 'starts_with', 'exact');
create type regra_campo as enum ('descricao', 'fornecedor_nome');
create type regra_origem as enum ('manual', 'auto_aprendida');

create table public.regras_categorizacao (
  id            uuid primary key default gen_random_uuid(),
  prioridade    int not null default 100,
  pattern       text not null,
  pattern_tipo  regra_pattern_tipo not null default 'contains',
  campo         regra_campo not null default 'descricao',
  categoria_id  uuid not null references public.categorias(id) on delete restrict,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  origem        regra_origem not null default 'manual',
  ativa         boolean not null default true,
  total_aplicacoes int not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index regras_ativa_prioridade on public.regras_categorizacao (prioridade desc) where ativa;
create index regras_categoria on public.regras_categorizacao (categoria_id);

create trigger regras_categorizacao_atualizado_em
  before update on public.regras_categorizacao
  for each row execute function public.tg_set_atualizado_em();

alter table public.regras_categorizacao enable row level security;

create policy "regras_select_authenticated"
  on public.regras_categorizacao for select to authenticated using (true);

create policy "regras_modify_can_write"
  on public.regras_categorizacao for all to authenticated
  using (public.can_write()) with check (public.can_write());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit: `feat(db): add regras_categorizacao with priority, pattern types, and origem tracking`

---

### Task 3: Migration 0023 — sugestoes_conciliacao

- [ ] **Step 1:** `supabase migration new sugestoes_conciliacao && mv supabase/migrations/*_sugestoes_conciliacao.sql supabase/migrations/0023_sugestoes_conciliacao.sql`

- [ ] **Step 2:**

```sql
create type break_tipo as enum (
  'matched',
  'timing-break',
  'amount-break',
  'mapping-issue',
  'duplicate',
  'bank-only',
  'ledger-only'
);

create type sugestao_status as enum ('pendente', 'aceita', 'rejeitada');

create table public.sugestoes_conciliacao (
  id                uuid primary key default gen_random_uuid(),
  lancamento_id     uuid not null references public.lancamentos(id) on delete cascade,
  candidato_tipo    text check (candidato_tipo in ('ap', 'ar')),
  candidato_id      uuid,                              -- AP or AR id
  break_tipo        break_tipo not null,
  score             numeric(4,3) not null check (score between 0 and 1),
  explicacao        text,
  status            sugestao_status not null default 'pendente',
  resolvida_em      timestamptz,
  resolvida_por     uuid references public.usuarios(id) on delete set null,
  criado_em         timestamptz not null default now()
);

create index sugestoes_lancamento on public.sugestoes_conciliacao (lancamento_id);
create index sugestoes_pendentes on public.sugestoes_conciliacao (criado_em desc) where status = 'pendente';
create index sugestoes_candidato on public.sugestoes_conciliacao (candidato_tipo, candidato_id);

alter table public.sugestoes_conciliacao enable row level security;

create policy "sugestoes_select_authenticated"
  on public.sugestoes_conciliacao for select to authenticated using (true);

create policy "sugestoes_modify_can_write"
  on public.sugestoes_conciliacao for all to authenticated
  using (public.can_write()) with check (public.can_write());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit: `feat(db): add sugestoes_conciliacao with break taxonomy from anthropics/financial-services`

---

### Task 4: Zod schemas

**Files:** `src/lib/schemas/{regra,sugestao,pluggy-item}.ts` + test.

- [ ] **Step 1:** Write failing test `tests/unit/schemas/bancos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { NewRegra } from '@/lib/schemas/regra'
import { NewSugestao } from '@/lib/schemas/sugestao'
import { NewPluggyItem } from '@/lib/schemas/pluggy-item'

describe('NewRegra', () => {
  const valid = {
    pattern: 'AWS',
    pattern_tipo: 'contains' as const,
    campo: 'descricao' as const,
    categoria_id: '550e8400-e29b-41d4-a716-446655440000',
  }
  it('accepts valid', () => {
    expect(NewRegra.safeParse(valid).success).toBe(true)
  })
  it('requires non-empty pattern', () => {
    expect(NewRegra.safeParse({ ...valid, pattern: '' }).success).toBe(false)
  })
})

describe('NewSugestao', () => {
  const valid = {
    lancamento_id: '550e8400-e29b-41d4-a716-446655440000',
    candidato_tipo: 'ap' as const,
    candidato_id: '550e8400-e29b-41d4-a716-446655440001',
    break_tipo: 'timing-break' as const,
    score: 0.75,
  }
  it('accepts valid', () => {
    expect(NewSugestao.safeParse(valid).success).toBe(true)
  })
  it('rejects score > 1', () => {
    expect(NewSugestao.safeParse({ ...valid, score: 1.5 }).success).toBe(false)
  })
  it('rejects negative score', () => {
    expect(NewSugestao.safeParse({ ...valid, score: -0.1 }).success).toBe(false)
  })
})

describe('NewPluggyItem', () => {
  it('accepts valid', () => {
    expect(NewPluggyItem.safeParse({
      pluggy_item_id: 'pl-abc-123', banco_nome: 'Itaú', status: 'updated',
    }).success).toBe(true)
  })
  it('rejects empty pluggy_item_id', () => {
    expect(NewPluggyItem.safeParse({
      pluggy_item_id: '', banco_nome: 'Itaú', status: 'updated',
    }).success).toBe(false)
  })
})
```

- [ ] **Step 2:** Implement:

`src/lib/schemas/regra.ts`:
```ts
import { z } from 'zod'
import { Uuid } from './common'

export const RegraPatternTipo = z.enum(['contains', 'regex', 'starts_with', 'exact'])
export const RegraCampo = z.enum(['descricao', 'fornecedor_nome'])
export const RegraOrigem = z.enum(['manual', 'auto_aprendida'])

export const NewRegra = z.object({
  prioridade: z.number().int().default(100),
  pattern: z.string().min(1),
  pattern_tipo: RegraPatternTipo.default('contains'),
  campo: RegraCampo.default('descricao'),
  categoria_id: Uuid,
  fornecedor_id: Uuid.optional(),
  origem: RegraOrigem.default('manual'),
  ativa: z.boolean().default(true),
})

export const Regra = NewRegra.extend({
  id: Uuid,
  ativa: z.boolean(),
  total_aplicacoes: z.number().int(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewRegra = z.infer<typeof NewRegra>
export type Regra = z.infer<typeof Regra>
```

`src/lib/schemas/sugestao.ts`:
```ts
import { z } from 'zod'
import { Uuid } from './common'

export const BreakTipo = z.enum([
  'matched', 'timing-break', 'amount-break', 'mapping-issue',
  'duplicate', 'bank-only', 'ledger-only',
])
export const SugestaoStatus = z.enum(['pendente', 'aceita', 'rejeitada'])

export const NewSugestao = z.object({
  lancamento_id: Uuid,
  candidato_tipo: z.enum(['ap', 'ar']).optional(),
  candidato_id: Uuid.optional(),
  break_tipo: BreakTipo,
  score: z.number().min(0).max(1),
  explicacao: z.string().optional(),
  status: SugestaoStatus.default('pendente'),
})

export const Sugestao = NewSugestao.extend({
  id: Uuid,
  status: SugestaoStatus,
  resolvida_em: z.string().nullable(),
  resolvida_por: Uuid.nullable(),
  criado_em: z.string(),
})

export type NewSugestao = z.infer<typeof NewSugestao>
export type Sugestao = z.infer<typeof Sugestao>
```

`src/lib/schemas/pluggy-item.ts`:
```ts
import { z } from 'zod'
import { Uuid } from './common'

export const PluggyItemStatus = z.enum([
  'updating', 'updated', 'login_error', 'waiting_user_input', 'outdated', 'error',
])

export const NewPluggyItem = z.object({
  pluggy_item_id: z.string().min(1),
  conta_bancaria_id: Uuid.optional(),
  banco_nome: z.string().min(1),
  status: PluggyItemStatus.default('updating'),
  last_error: z.string().optional(),
})

export const PluggyItem = NewPluggyItem.extend({
  id: Uuid,
  status: PluggyItemStatus,
  last_synced_at: z.string().nullable(),
  last_error: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewPluggyItem = z.infer<typeof NewPluggyItem>
export type PluggyItem = z.infer<typeof PluggyItem>
```

- [ ] **Step 3:** Run test → expect ~6 pass.
- [ ] **Step 4:** Commit: `feat(schemas): zod for regra, sugestao, pluggy-item`

---

### Task 5: LLM client wrapper (with mock + caching)

**Files:** `src/lib/llm/client.ts`, `src/lib/llm/types.ts` + test.

- [ ] **Step 1:** Install:
```bash
npm install @anthropic-ai/sdk
```

Add to `.env.example`:
```
LLM_MODE=mock
ANTHROPIC_API_KEY=
```

Add to `.env.local`:
```
LLM_MODE=mock
```

- [ ] **Step 2:** Write `src/lib/llm/types.ts`:

```ts
import 'server-only'
import { z } from 'zod'

export const CategoriaSuggestion = z.object({
  categoria_id: z.string().uuid().nullable(),
  confianca: z.number().min(0).max(1),
  justificativa: z.string().max(300),
})

export type CategoriaSuggestion = z.infer<typeof CategoriaSuggestion>

export const BreakClassification = z.object({
  classificacao: z.enum([
    'matched', 'timing-break', 'amount-break', 'mapping-issue',
    'duplicate', 'bank-only', 'ledger-only',
  ]),
  melhor_match_id: z.string().uuid().nullable(),
  score: z.number().min(0).max(1),
  explicacao: z.string().max(300),
})

export type BreakClassification = z.infer<typeof BreakClassification>
```

- [ ] **Step 3:** Write failing test `tests/unit/lib/llm/client.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('LLM client (mock mode)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.LLM_MODE = 'mock'
  })

  it('classifyCategoria returns mock suggestion', async () => {
    const { classifyCategoria } = await import('@/lib/llm/client')
    const result = await classifyCategoria({
      descricao: 'AWS *Cloud Services',
      valor: 500,
      categorias: [{ id: 'cat-1', nome: 'Cloud' }, { id: 'cat-2', nome: 'Aluguel' }],
      exemplosSimilares: [],
    })
    expect(result.categoria_id).toBeTypeOf('string')
    expect(result.confianca).toBeGreaterThanOrEqual(0)
    expect(result.confianca).toBeLessThanOrEqual(1)
    expect(result.justificativa.length).toBeGreaterThan(0)
  })

  it('classifyBreak returns valid taxonomy class', async () => {
    const { classifyBreak } = await import('@/lib/llm/client')
    const result = await classifyBreak({
      lancamento: { id: 'l1', valor: 100, data: '2026-05-10', descricao: 'Pix recebido' },
      candidatos: [
        { id: 'ap1', tipo: 'ar', valor: 100, data: '2026-05-09', descricao: 'AR contrato cliente X' },
      ],
    })
    expect([
      'matched', 'timing-break', 'amount-break', 'mapping-issue',
      'duplicate', 'bank-only', 'ledger-only',
    ]).toContain(result.classificacao)
  })
})
```

- [ ] **Step 4:** Implement `src/lib/llm/client.ts`:

```ts
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { CategoriaSuggestion, BreakClassification } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type ClassifyCategoriaInput = {
  descricao: string
  valor: number
  categorias: { id: string; nome: string }[]
  exemplosSimilares: { descricao: string; categoria_id: string }[]
}

type ClassifyBreakInput = {
  lancamento: { id: string; valor: number; data: string; descricao: string }
  candidatos: { id: string; tipo: 'ap' | 'ar'; valor: number; data: string; descricao: string }[]
}

/**
 * Read-only LLM orchestrator. Returns Zod-validated JSON. NEVER receives a
 * Supabase client. Writes happen in dedicated server handlers post-validation.
 *
 * Mode controlled by env var `LLM_MODE` (mock | real). Mock mode returns a
 * deterministic best-effort guess based on simple string match.
 */
export async function classifyCategoria(input: ClassifyCategoriaInput): Promise<CategoriaSuggestion> {
  if (process.env.LLM_MODE !== 'real') {
    return mockClassifyCategoria(input)
  }
  return realClassifyCategoria(input)
}

export async function classifyBreak(input: ClassifyBreakInput): Promise<BreakClassification> {
  if (process.env.LLM_MODE !== 'real') {
    return mockClassifyBreak(input)
  }
  return realClassifyBreak(input)
}

// ===== mock =====

function mockClassifyCategoria(input: ClassifyCategoriaInput): CategoriaSuggestion {
  const desc = input.descricao.toLowerCase()
  // Best-effort string-match against categoria names; otherwise pick first w/ low confidence
  const matched = input.categorias.find((c) => desc.includes(c.nome.toLowerCase()))
  if (matched) {
    return {
      categoria_id: matched.id,
      confianca: 0.85,
      justificativa: `Mock: descrição contém "${matched.nome}"`,
    }
  }
  return {
    categoria_id: input.categorias[0]?.id ?? null,
    confianca: 0.4,
    justificativa: 'Mock: nenhum match óbvio, retornando primeira categoria com baixa confiança',
  }
}

function mockClassifyBreak(input: ClassifyBreakInput): BreakClassification {
  if (input.candidatos.length === 0) {
    return {
      classificacao: 'bank-only',
      melhor_match_id: null,
      score: 1,
      explicacao: 'Mock: sem candidatos',
    }
  }
  const c = input.candidatos[0]!
  const sameValue = Math.abs(c.valor - input.lancamento.valor) < 0.01
  const sameDate = c.data === input.lancamento.data
  if (sameValue && sameDate) {
    return {
      classificacao: 'matched',
      melhor_match_id: c.id,
      score: 0.95,
      explicacao: 'Mock: valor + data batem',
    }
  }
  if (sameValue && !sameDate) {
    return {
      classificacao: 'timing-break',
      melhor_match_id: c.id,
      score: 0.7,
      explicacao: 'Mock: valor bate, data fora da janela',
    }
  }
  return {
    classificacao: 'mapping-issue',
    melhor_match_id: c.id,
    score: 0.3,
    explicacao: 'Mock: divergência não-classificada',
  }
}

// ===== real (Anthropic SDK + prompt caching) =====

let _client: Anthropic | null = null
function getClient() {
  if (_client) return _client
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY required when LLM_MODE=real')
  }
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

async function readSkillPrompt(name: 'categorizacao' | 'reconciliacao'): Promise<string> {
  const p = path.join(process.cwd(), 'prompts', name, 'SKILL.md')
  return readFile(p, 'utf-8')
}

async function realClassifyCategoria(input: ClassifyCategoriaInput): Promise<CategoriaSuggestion> {
  const sys = await readSkillPrompt('categorizacao')
  const client = getClient()

  const categoriasList = input.categorias.map((c) => `- ${c.id}: ${c.nome}`).join('\n')
  const userText = `
Lançamento a categorizar:
- Descrição: ${input.descricao}
- Valor: R$ ${input.valor.toFixed(2)}

Categorias disponíveis:
${categoriasList}

${input.exemplosSimilares.length > 0 ? `Exemplos recentes:\n${input.exemplosSimilares.map((e) => `- "${e.descricao}" → ${e.categoria_id}`).join('\n')}` : ''}

Retorne APENAS um JSON com {"categoria_id": "<uuid ou null>", "confianca": <0..1>, "justificativa": "<máx 300 chars>"}.
`.trim()

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: [
      { type: 'text', text: sys, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Categorias: ${categoriasList}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userText }],
  })

  const text = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
  const parsed = extractJSON(text)
  return CategoriaSuggestion.parse(parsed)
}

async function realClassifyBreak(input: ClassifyBreakInput): Promise<BreakClassification> {
  const sys = await readSkillPrompt('reconciliacao')
  const client = getClient()

  const candidatosList = input.candidatos.map((c) =>
    `- ${c.id} [${c.tipo}]: R$ ${c.valor.toFixed(2)} em ${c.data} — "${c.descricao}"`
  ).join('\n')

  const userText = `
Lançamento Pluggy a classificar:
- ID: ${input.lancamento.id}
- Valor: R$ ${input.lancamento.valor.toFixed(2)}
- Data: ${input.lancamento.data}
- Descrição: ${input.lancamento.descricao}

Candidatos AP/AR:
${candidatosList || '(nenhum)'}

Retorne APENAS um JSON com {"classificacao": "<uma das 7 categorias>", "melhor_match_id": "<uuid ou null>", "score": <0..1>, "explicacao": "<máx 300 chars>"}.
`.trim()

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: [
      { type: 'text', text: sys, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userText }],
  })

  const text = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
  const parsed = extractJSON(text)
  return BreakClassification.parse(parsed)
}

function extractJSON(text: string): unknown {
  // Strip markdown fence if present
  const m = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  const raw = m ? m[1]! : text
  return JSON.parse(raw)
}
```

- [ ] **Step 5:** Run test → expect 2 pass.
- [ ] **Step 6:** Commit: `feat(llm): Anthropic SDK wrapper with mock mode, prompt caching, read-only orchestrator pattern`

---

### Task 6: Pluggy client wrapper (mock + real)

**Files:** `src/modules/bancos/pluggy-client.ts` + test.

- [ ] **Step 1:** Add to `.env.example`:
```
PLUGGY_MODE=mock
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
```

Add to `.env.local`:
```
PLUGGY_MODE=mock
```

- [ ] **Step 2:** Write failing test `tests/unit/modules/bancos/pluggy-client.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Pluggy client (mock mode)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.PLUGGY_MODE = 'mock'
  })

  it('listTransactions returns mock transactions for an item', async () => {
    const { listTransactions } = await import('@/modules/bancos/pluggy-client')
    const txs = await listTransactions({ pluggyItemId: 'mock-item-1', from: '2026-05-01', to: '2026-05-31' })
    expect(Array.isArray(txs)).toBe(true)
    expect(txs.length).toBeGreaterThan(0)
    expect(txs[0]).toMatchObject({
      id: expect.any(String),
      date: expect.any(String),
      amount: expect.any(Number),
      description: expect.any(String),
    })
  })

  it('getItem returns mock item status', async () => {
    const { getItem } = await import('@/modules/bancos/pluggy-client')
    const item = await getItem('mock-item-1')
    expect(item.id).toBe('mock-item-1')
    expect(['updated', 'updating', 'error']).toContain(item.status)
  })
})
```

- [ ] **Step 3:** Implement `src/modules/bancos/pluggy-client.ts`:

```ts
import 'server-only'

export type PluggyTransaction = {
  id: string
  date: string             // YYYY-MM-DD
  amount: number           // positive=entrada, negative=saida (Pluggy convention)
  description: string
  type: 'CREDIT' | 'DEBIT'
  category: string | null
  pluggy_account_id: string
}

export type PluggyItem = {
  id: string
  status: 'updating' | 'updated' | 'login_error' | 'waiting_user_input' | 'outdated' | 'error'
  connector: { name: string }
  lastUpdatedAt: string | null
}

/**
 * Pluggy REST client. Mock mode returns deterministic fixture data.
 * Real mode talks to https://api.pluggy.ai.
 */
export async function listTransactions(p: {
  pluggyItemId: string
  from: string
  to: string
}): Promise<PluggyTransaction[]> {
  if (process.env.PLUGGY_MODE !== 'real') {
    return mockTransactions(p)
  }
  return realListTransactions(p)
}

export async function getItem(pluggyItemId: string): Promise<PluggyItem> {
  if (process.env.PLUGGY_MODE !== 'real') {
    return {
      id: pluggyItemId,
      status: 'updated',
      connector: { name: 'Mock Bank' },
      lastUpdatedAt: new Date().toISOString(),
    }
  }
  return realGetItem(pluggyItemId)
}

// ===== mock =====

function mockTransactions(p: { pluggyItemId: string; from: string; to: string }): PluggyTransaction[] {
  return [
    {
      id: `mock-tx-${p.pluggyItemId}-1`,
      date: p.from,
      amount: -500,
      description: 'AWS *Cloud Services',
      type: 'DEBIT',
      category: 'Tecnologia',
      pluggy_account_id: `acc-${p.pluggyItemId}`,
    },
    {
      id: `mock-tx-${p.pluggyItemId}-2`,
      date: p.from,
      amount: -120,
      description: 'Vercel Inc',
      type: 'DEBIT',
      category: 'Tecnologia',
      pluggy_account_id: `acc-${p.pluggyItemId}`,
    },
    {
      id: `mock-tx-${p.pluggyItemId}-3`,
      date: p.to,
      amount: 5000,
      description: 'Pix recebido Cliente X',
      type: 'CREDIT',
      category: 'Receita',
      pluggy_account_id: `acc-${p.pluggyItemId}`,
    },
  ]
}

// ===== real =====

let cachedToken: { token: string; exp: number } | null = null

async function getApiKey(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.exp > now + 60_000) return cachedToken.token

  const id = process.env.PLUGGY_CLIENT_ID
  const secret = process.env.PLUGGY_CLIENT_SECRET
  if (!id || !secret) throw new Error('PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET required when PLUGGY_MODE=real')

  const r = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: id, clientSecret: secret }),
  })
  if (!r.ok) throw new Error(`Pluggy auth failed: ${r.status} ${await r.text()}`)
  const j = await r.json() as { apiKey: string }
  cachedToken = { token: j.apiKey, exp: now + 30 * 60 * 1000 }   // 30 min
  return j.apiKey
}

async function realListTransactions(p: { pluggyItemId: string; from: string; to: string }): Promise<PluggyTransaction[]> {
  const apiKey = await getApiKey()
  // First get accounts for the item
  const accR = await fetch(`https://api.pluggy.ai/accounts?itemId=${encodeURIComponent(p.pluggyItemId)}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!accR.ok) throw new Error(`Pluggy accounts: ${accR.status}`)
  const accJson = await accR.json() as { results: { id: string }[] }

  const all: PluggyTransaction[] = []
  for (const acc of accJson.results) {
    const url = `https://api.pluggy.ai/transactions?accountId=${acc.id}&from=${p.from}&to=${p.to}&pageSize=500`
    const txR = await fetch(url, { headers: { 'X-API-KEY': apiKey } })
    if (!txR.ok) throw new Error(`Pluggy transactions: ${txR.status}`)
    const txJson = await txR.json() as { results: Array<{
      id: string; date: string; amount: number; description: string; type: 'CREDIT' | 'DEBIT'; category: string | null
    }> }
    all.push(...txJson.results.map((t) => ({
      id: t.id,
      date: t.date.slice(0, 10),
      amount: t.amount,
      description: t.description,
      type: t.type,
      category: t.category,
      pluggy_account_id: acc.id,
    })))
  }
  return all
}

async function realGetItem(pluggyItemId: string): Promise<PluggyItem> {
  const apiKey = await getApiKey()
  const r = await fetch(`https://api.pluggy.ai/items/${encodeURIComponent(pluggyItemId)}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!r.ok) throw new Error(`Pluggy item: ${r.status}`)
  return r.json()
}
```

- [ ] **Step 4:** Run test → expect 2 pass.
- [ ] **Step 5:** Commit: `feat(bancos): Pluggy REST client with mock mode + real API (auth, items, transactions)`

---

### Task 7: Regras service (TDD)

**Files:** `src/modules/categorizacao/regras.ts` + test.

- [ ] **Step 1:** Write failing test `tests/unit/modules/categorizacao/regras.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchRegras } from '@/modules/categorizacao/regras'
import type { Regra } from '@/lib/schemas/regra'

function regra(p: Partial<Regra>): Regra {
  return {
    id: crypto.randomUUID(),
    prioridade: 100,
    pattern: 'AWS',
    pattern_tipo: 'contains',
    campo: 'descricao',
    categoria_id: 'cat-1',
    fornecedor_id: undefined,
    origem: 'manual',
    ativa: true,
    total_aplicacoes: 0,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...p,
  }
}

describe('matchRegras', () => {
  it('returns null when no regras', () => {
    expect(matchRegras([], 'descricao qualquer', undefined)).toBeNull()
  })

  it('matches contains pattern', () => {
    const r = regra({ pattern: 'AWS', pattern_tipo: 'contains' })
    const result = matchRegras([r], 'AWS *Cloud Services', undefined)
    expect(result?.id).toBe(r.id)
  })

  it('contains is case insensitive', () => {
    const r = regra({ pattern: 'aws', pattern_tipo: 'contains' })
    const result = matchRegras([r], 'AWS *Cloud', undefined)
    expect(result?.id).toBe(r.id)
  })

  it('matches starts_with', () => {
    const r = regra({ pattern: 'PIX', pattern_tipo: 'starts_with' })
    expect(matchRegras([r], 'PIX recebido', undefined)?.id).toBe(r.id)
    expect(matchRegras([r], 'Recebido via PIX', undefined)).toBeNull()
  })

  it('matches exact', () => {
    const r = regra({ pattern: 'IOF', pattern_tipo: 'exact' })
    expect(matchRegras([r], 'IOF', undefined)?.id).toBe(r.id)
    expect(matchRegras([r], 'IOF cobrado', undefined)).toBeNull()
  })

  it('matches regex', () => {
    const r = regra({ pattern: '^AWS.*Cloud$', pattern_tipo: 'regex' })
    expect(matchRegras([r], 'AWS Mega Cloud', undefined)?.id).toBe(r.id)
  })

  it('respects prioridade order (higher first)', () => {
    const r1 = regra({ pattern: 'AWS', prioridade: 50, categoria_id: 'cat-low' })
    const r2 = regra({ pattern: 'AWS', prioridade: 200, categoria_id: 'cat-hi' })
    const result = matchRegras([r1, r2], 'AWS Cloud', undefined)
    expect(result?.categoria_id).toBe('cat-hi')
  })

  it('skips ativa=false', () => {
    const r = regra({ pattern: 'AWS', ativa: false })
    expect(matchRegras([r], 'AWS Cloud', undefined)).toBeNull()
  })

  it('matches campo=fornecedor_nome when fornecedor passed', () => {
    const r = regra({ pattern: 'Amazon', campo: 'fornecedor_nome' })
    expect(matchRegras([r], 'descricao qualquer', 'Amazon Web Services')?.id).toBe(r.id)
    expect(matchRegras([r], 'descricao qualquer', 'Microsoft')).toBeNull()
  })
})
```

- [ ] **Step 2:** Implement `src/modules/categorizacao/regras.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import type { Regra, NewRegra } from '@/lib/schemas/regra'
import { NewRegra as NewRegraSchema } from '@/lib/schemas/regra'
import type { z } from 'zod'

export async function listarRegras(p: { ativa?: boolean } = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('regras_categorizacao')
    .select('*, categoria:categorias(nome)')
    .order('prioridade', { ascending: false })
  if (p.ativa !== undefined) q = q.eq('ativa', p.ativa)
  const { data, error } = await q
  if (error) throw new Error(`listarRegras: ${error.message}`)
  return data ?? []
}

export async function criarRegra(input: z.input<typeof NewRegraSchema>) {
  const parsed = NewRegraSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('regras_categorizacao').insert(parsed).select().single()
  if (error) throw new Error(`criarRegra: ${error.message}`)
  return data as Regra
}

export async function atualizarRegra(id: string, input: Partial<z.input<typeof NewRegraSchema>>) {
  const parsed = NewRegraSchema.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('regras_categorizacao').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarRegra: ${error.message}`)
  return data as Regra
}

/**
 * Pure function: given a list of regras, descricao, and optional fornecedor name,
 * returns the first matching regra by prioridade descending. Null if no match.
 */
export function matchRegras(
  regras: Regra[],
  descricao: string,
  fornecedorNome: string | undefined,
): Regra | null {
  const ativas = regras.filter((r) => r.ativa)
  // Sort by prioridade desc (highest priority first)
  const sorted = [...ativas].sort((a, b) => b.prioridade - a.prioridade)
  for (const r of sorted) {
    const haystack = r.campo === 'descricao' ? descricao : (fornecedorNome ?? '')
    if (matchPattern(haystack, r.pattern, r.pattern_tipo)) return r
  }
  return null
}

function matchPattern(haystack: string, pattern: string, tipo: Regra['pattern_tipo']): boolean {
  const h = haystack.toLowerCase()
  const p = pattern.toLowerCase()
  switch (tipo) {
    case 'contains':    return h.includes(p)
    case 'starts_with': return h.startsWith(p)
    case 'exact':       return h === p
    case 'regex': {
      try { return new RegExp(pattern, 'i').test(haystack) } catch { return false }
    }
  }
}
```

- [ ] **Step 3:** Run → expect ~9 tests pass.
- [ ] **Step 4:** Commit: `feat(categorizacao): regras matcher with priority, pattern types, ativa filter (TDD)`

---

### Task 8: Historico service (TDD)

**Files:** `src/modules/categorizacao/historico.ts` + test.

- [ ] **Step 1:** Write failing test `tests/unit/modules/categorizacao/historico.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchHistorico } from '@/modules/categorizacao/historico'

describe('matchHistorico', () => {
  it('returns null when no history', () => {
    expect(matchHistorico('AWS Cloud', [])).toBeNull()
  })

  it('returns categoria when fornecedor seen >=3 times with same categoria', () => {
    const history = [
      { descricao: 'AWS Cloud Services', categoria_id: 'cat-tech', fornecedor_id: 'f1' },
      { descricao: 'AWS Cloud Storage', categoria_id: 'cat-tech', fornecedor_id: 'f1' },
      { descricao: 'AWS *Lambda', categoria_id: 'cat-tech', fornecedor_id: 'f1' },
    ]
    const result = matchHistorico('AWS New Service', history)
    expect(result).toEqual({ categoria_id: 'cat-tech', confianca: 0.9 })
  })

  it('returns null when fewer than 3 matches by descricao token', () => {
    const history = [
      { descricao: 'AWS Cloud', categoria_id: 'cat-tech', fornecedor_id: 'f1' },
      { descricao: 'AWS Lambda', categoria_id: 'cat-tech', fornecedor_id: 'f1' },
    ]
    expect(matchHistorico('AWS Storage', history)).toBeNull()
  })

  it('returns majority categoria when mixed', () => {
    const history = [
      { descricao: 'AWS X', categoria_id: 'cat-a' },
      { descricao: 'AWS Y', categoria_id: 'cat-a' },
      { descricao: 'AWS Z', categoria_id: 'cat-a' },
      { descricao: 'AWS W', categoria_id: 'cat-b' },
    ]
    expect(matchHistorico('AWS V', history)?.categoria_id).toBe('cat-a')
  })
})
```

- [ ] **Step 2:** Implement `src/modules/categorizacao/historico.ts`:

```ts
export type HistoricoEntry = {
  descricao: string
  categoria_id: string
  fornecedor_id?: string | null
}

/**
 * Given a descricao + recent categorized lancamentos, look for a stable pattern:
 * - take the first meaningful word of descricao (skip <=3 char tokens)
 * - find entries whose descricao starts with the same first word
 * - if >=3 matches AND a majority categoria_id, return it
 */
export function matchHistorico(
  descricao: string,
  history: HistoricoEntry[],
): { categoria_id: string; confianca: number } | null {
  const tokens = descricao.split(/\s+/).filter((t) => t.length > 3)
  if (tokens.length === 0) return null
  const firstToken = tokens[0]!.toLowerCase()

  const matches = history.filter((h) =>
    h.descricao.toLowerCase().split(/\s+/)[0] === firstToken
  )
  if (matches.length < 3) return null

  const counts = new Map<string, number>()
  for (const m of matches) {
    counts.set(m.categoria_id, (counts.get(m.categoria_id) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted[0]!
  // Majority threshold: top must be at least 60% of matches
  if (top[1] / matches.length < 0.6) return null
  return { categoria_id: top[0], confianca: 0.9 }
}
```

- [ ] **Step 3:** Run → expect 4 tests pass.
- [ ] **Step 4:** Commit: `feat(categorizacao): historico matcher (fornecedor frequency + majority categoria) (TDD)`

---

### Task 9: Cascata orchestrator (TDD)

**Files:** `src/modules/categorizacao/cascata.ts` + test.

- [ ] **Step 1:** Write failing test `tests/unit/modules/categorizacao/cascata.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { categorizar } from '@/modules/categorizacao/cascata'
import type { Regra } from '@/lib/schemas/regra'

// Mock the LLM client to avoid real API calls
vi.mock('@/lib/llm/client', () => ({
  classifyCategoria: vi.fn(async () => ({
    categoria_id: 'cat-llm',
    confianca: 0.8,
    justificativa: 'Mocked',
  })),
}))

const baseRegra: Regra = {
  id: 'r1', prioridade: 100, pattern: 'AWS', pattern_tipo: 'contains',
  campo: 'descricao', categoria_id: 'cat-regra', fornecedor_id: undefined,
  origem: 'manual', ativa: true, total_aplicacoes: 0,
  criado_em: '2026-01-01T00:00:00Z', atualizado_em: '2026-01-01T00:00:00Z',
}

describe('categorizar (cascata)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('regra wins when match exists', async () => {
    const result = await categorizar({
      descricao: 'AWS Cloud',
      valor: 100,
      regras: [baseRegra],
      historico: [],
      categorias: [{ id: 'cat-regra', nome: 'Cloud' }],
    })
    expect(result.categoria_id).toBe('cat-regra')
    expect(result.metodo).toBe('regra')
    expect(result.confianca).toBe(1.0)
  })

  it('historico wins when no regra but >=3 history entries', async () => {
    const history = [
      { descricao: 'Vercel A', categoria_id: 'cat-hist' },
      { descricao: 'Vercel B', categoria_id: 'cat-hist' },
      { descricao: 'Vercel C', categoria_id: 'cat-hist' },
    ]
    const result = await categorizar({
      descricao: 'Vercel D',
      valor: 50,
      regras: [],
      historico: history,
      categorias: [{ id: 'cat-hist', nome: 'Tech' }],
    })
    expect(result.categoria_id).toBe('cat-hist')
    expect(result.metodo).toBe('historico')
    expect(result.confianca).toBe(0.9)
  })

  it('falls through to LLM when no regra and no historico match', async () => {
    const result = await categorizar({
      descricao: 'Unknown vendor',
      valor: 100,
      regras: [],
      historico: [],
      categorias: [{ id: 'cat-llm', nome: 'Outros' }],
    })
    expect(result.categoria_id).toBe('cat-llm')
    expect(result.metodo).toBe('llm')
  })

  it('marks pendente when LLM confidence <= 0.7', async () => {
    const { classifyCategoria } = await import('@/lib/llm/client')
    vi.mocked(classifyCategoria).mockResolvedValueOnce({
      categoria_id: 'cat-uncertain', confianca: 0.5, justificativa: 'low',
    })

    const result = await categorizar({
      descricao: 'Algo estranho',
      valor: 999,
      regras: [],
      historico: [],
      categorias: [{ id: 'cat-uncertain', nome: 'X' }],
    })
    expect(result.metodo).toBe('llm')
    expect(result.pendente).toBe(true)
  })
})
```

- [ ] **Step 2:** Implement `src/modules/categorizacao/cascata.ts`:

```ts
import 'server-only'
import { matchRegras } from './regras'
import { matchHistorico, type HistoricoEntry } from './historico'
import { classifyCategoria } from '@/lib/llm/client'
import type { Regra } from '@/lib/schemas/regra'

export type CategorizarInput = {
  descricao: string
  valor: number
  fornecedorNome?: string
  regras: Regra[]
  historico: HistoricoEntry[]
  categorias: { id: string; nome: string }[]
}

export type CategorizarResult = {
  categoria_id: string | null
  confianca: number
  metodo: 'regra' | 'historico' | 'llm'
  justificativa: string
  pendente: boolean      // true when confianca <= LIMIAR_PENDENTE
  regra_id?: string
}

export const LIMIAR_PENDENTE = 0.7

/**
 * Cascade orchestrator: regra → historico → LLM. Returns CategorizarResult.
 * Pure orchestrator — does NOT write to DB.
 */
export async function categorizar(input: CategorizarInput): Promise<CategorizarResult> {
  // 1. Regra
  const r = matchRegras(input.regras, input.descricao, input.fornecedorNome)
  if (r) {
    return {
      categoria_id: r.categoria_id,
      confianca: 1.0,
      metodo: 'regra',
      justificativa: `Regra "${r.pattern}" (${r.pattern_tipo})`,
      pendente: false,
      regra_id: r.id,
    }
  }

  // 2. Histórico
  const h = matchHistorico(input.descricao, input.historico)
  if (h) {
    return {
      categoria_id: h.categoria_id,
      confianca: h.confianca,
      metodo: 'historico',
      justificativa: 'Padrão recorrente em histórico',
      pendente: false,
    }
  }

  // 3. LLM
  const llm = await classifyCategoria({
    descricao: input.descricao,
    valor: input.valor,
    categorias: input.categorias,
    exemplosSimilares: input.historico.slice(0, 5).map((e) => ({
      descricao: e.descricao,
      categoria_id: e.categoria_id,
    })),
  })

  return {
    categoria_id: llm.categoria_id,
    confianca: llm.confianca,
    metodo: 'llm',
    justificativa: llm.justificativa,
    pendente: llm.confianca <= LIMIAR_PENDENTE,
  }
}
```

- [ ] **Step 3:** Run → expect 4 tests pass.
- [ ] **Step 4:** Commit: `feat(categorizacao): cascata orchestrator (regra → historico → LLM) (TDD)`

---

### Task 10: Conciliacao service (TDD)

**Files:** `src/modules/bancos/conciliacao.ts` + test.

- [ ] **Step 1:** Write failing test `tests/unit/modules/bancos/conciliacao.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { classificarBreak, scoreMatch } from '@/modules/bancos/conciliacao'

const lanc = (p: Partial<{ id: string; valor: number; data: string; descricao: string; tipo: 'entrada' | 'saida' }>) => ({
  id: p.id ?? 'l1',
  valor: p.valor ?? 100,
  data: p.data ?? '2026-05-10',
  descricao: p.descricao ?? 'Pix recebido',
  tipo: p.tipo ?? ('entrada' as const),
})

const cand = (p: Partial<{ id: string; valor: number; data_vencimento: string; descricao: string; tipo: 'ap' | 'ar' }>) => ({
  id: p.id ?? 'c1',
  valor: p.valor ?? 100,
  data_vencimento: p.data_vencimento ?? '2026-05-10',
  descricao: p.descricao ?? 'AR cliente X',
  tipo: p.tipo ?? ('ar' as const),
})

describe('scoreMatch', () => {
  it('exact value + same date → 0.8+', () => {
    const s = scoreMatch(lanc({ valor: 100, data: '2026-05-10' }), cand({ valor: 100, data_vencimento: '2026-05-10', descricao: 'Pix' }))
    expect(s).toBeGreaterThanOrEqual(0.8)
  })

  it('exact value, 1 day off → still high', () => {
    const s = scoreMatch(lanc({ valor: 100, data: '2026-05-10' }), cand({ valor: 100, data_vencimento: '2026-05-09' }))
    expect(s).toBeGreaterThan(0.6)
    expect(s).toBeLessThan(0.95)
  })

  it('value differs by 1% → low', () => {
    const s = scoreMatch(lanc({ valor: 100 }), cand({ valor: 99 }))
    expect(s).toBeLessThan(0.5)
  })
})

describe('classificarBreak', () => {
  it('no candidates → bank-only', () => {
    const r = classificarBreak(lanc({}), [])
    expect(r.classificacao).toBe('bank-only')
  })

  it('exact value + date match → matched', () => {
    const c = cand({ valor: 100, data_vencimento: '2026-05-10' })
    const r = classificarBreak(lanc({ valor: 100, data: '2026-05-10' }), [c])
    expect(r.classificacao).toBe('matched')
    expect(r.melhor_match_id).toBe(c.id)
    expect(r.score).toBeGreaterThanOrEqual(0.8)
  })

  it('exact value, date >3d off → timing-break', () => {
    const c = cand({ valor: 100, data_vencimento: '2026-05-01' })
    const r = classificarBreak(lanc({ valor: 100, data: '2026-05-10' }), [c])
    expect(r.classificacao).toBe('timing-break')
  })

  it('same date, valor differs → amount-break', () => {
    const c = cand({ valor: 105, data_vencimento: '2026-05-10' })
    const r = classificarBreak(lanc({ valor: 100, data: '2026-05-10' }), [c])
    expect(r.classificacao).toBe('amount-break')
  })

  it('multiple candidates with same exact match → matched on first', () => {
    const c1 = cand({ id: 'c1', valor: 100, data_vencimento: '2026-05-10' })
    const c2 = cand({ id: 'c2', valor: 100, data_vencimento: '2026-05-10' })
    const r = classificarBreak(lanc({ valor: 100, data: '2026-05-10' }), [c1, c2])
    expect(r.classificacao).toBe('matched')
    expect(['c1', 'c2']).toContain(r.melhor_match_id)
  })
})
```

- [ ] **Step 2:** Implement `src/modules/bancos/conciliacao.ts`:

```ts
import type { BreakClassification } from '@/lib/llm/types'

export type LancamentoBank = {
  id: string
  valor: number
  data: string
  descricao: string
  tipo: 'entrada' | 'saida'
}

export type Candidato = {
  id: string
  valor: number
  data_vencimento: string
  descricao: string
  tipo: 'ap' | 'ar'
}

/**
 * Score 0..1 for how well a candidate matches a lancamento.
 * - value exact (±0.01): +0.5
 * - date within ±1d: +0.3
 * - date within ±3d: +0.1 (instead of the +0.3)
 * - descricao similar (case-insensitive substring): +0.2
 */
export function scoreMatch(lanc: LancamentoBank, c: Candidato): number {
  let s = 0
  if (Math.abs(lanc.valor - c.valor) < 0.01) s += 0.5
  const dayDiff = Math.abs(diffDays(lanc.data, c.data_vencimento))
  if (dayDiff <= 1) s += 0.3
  else if (dayDiff <= 3) s += 0.1
  if (similarDescription(lanc.descricao, c.descricao)) s += 0.2
  return Math.min(1, s)
}

/**
 * Classify the relationship between a Pluggy lancamento and candidates.
 * Implements the break taxonomy from anthropics/financial-services.
 */
export function classificarBreak(
  lanc: LancamentoBank,
  candidatos: Candidato[],
): { classificacao: BreakClassification['classificacao']; melhor_match_id: string | null; score: number; explicacao: string } {
  if (candidatos.length === 0) {
    return {
      classificacao: 'bank-only',
      melhor_match_id: null,
      score: 1,
      explicacao: 'Lançamento sem candidatos AP/AR correspondentes',
    }
  }

  // Detect duplicates: same value AND same description in last 72h is handled
  // upstream when fetching candidatos; here we focus on the relationship to AP/AR.

  // Find best candidate by score
  const scored = candidatos.map((c) => ({ c, score: scoreMatch(lanc, c) }))
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]!
  const valorMatch = Math.abs(lanc.valor - best.c.valor) < 0.01
  const dayDiff = Math.abs(diffDays(lanc.data, best.c.data_vencimento))

  if (best.score >= 0.8) {
    return {
      classificacao: 'matched',
      melhor_match_id: best.c.id,
      score: best.score,
      explicacao: 'Valor + data + descrição alinhados',
    }
  }

  if (valorMatch && dayDiff > 3) {
    return {
      classificacao: 'timing-break',
      melhor_match_id: best.c.id,
      score: best.score,
      explicacao: `Valor exato, mas vencimento ${dayDiff}d fora da janela`,
    }
  }

  if (!valorMatch && dayDiff <= 1) {
    return {
      classificacao: 'amount-break',
      melhor_match_id: best.c.id,
      score: best.score,
      explicacao: `Mesma data, valor diverge em R$ ${(lanc.valor - best.c.valor).toFixed(2)}`,
    }
  }

  // No clear match
  return {
    classificacao: 'mapping-issue',
    melhor_match_id: best.c.id,
    score: best.score,
    explicacao: 'Divergência em múltiplos campos — revisar manualmente',
  }
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((da - db) / (24 * 60 * 60 * 1000))
}

function similarDescription(a: string, b: string): boolean {
  const an = a.toLowerCase().replace(/[^a-z0-9 ]/g, '')
  const bn = b.toLowerCase().replace(/[^a-z0-9 ]/g, '')
  const tokensA = an.split(/\s+/).filter((t) => t.length > 3)
  const tokensB = bn.split(/\s+/).filter((t) => t.length > 3)
  for (const t of tokensA) {
    if (tokensB.includes(t)) return true
  }
  return false
}
```

- [ ] **Step 3:** Run → expect 8 tests pass.
- [ ] **Step 4:** Commit: `feat(bancos): conciliacao with break taxonomy (scoreMatch, classificarBreak) (TDD)`

---

### Task 11: Sync service (Pluggy → lancamentos)

**Files:** `src/modules/bancos/sync.ts`.

This wires the pluggy-client + categorizacao cascade. Server-side, calls categorizar() per new transaction. Not unit-tested directly (integration test in Task 14).

- [ ] **Step 1:** Implement `src/modules/bancos/sync.ts`:

```ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { listTransactions, getItem } from './pluggy-client'
import { categorizar } from '@/modules/categorizacao/cascata'
import type { Regra } from '@/lib/schemas/regra'

export type SyncResult = {
  pluggy_item_id: string
  inserted: number
  skipped: number
  categorizados: number
  pendentes: number
  errors: string[]
}

export async function syncPluggyItem(pluggyItemId: string): Promise<SyncResult> {
  const admin = createServiceClient()
  const result: SyncResult = { pluggy_item_id: pluggyItemId, inserted: 0, skipped: 0, categorizados: 0, pendentes: 0, errors: [] }

  // 1. Find linked conta_bancaria
  const { data: pluggyItem } = await admin
    .from('pluggy_items').select('id, conta_bancaria_id').eq('pluggy_item_id', pluggyItemId).maybeSingle()
  if (!pluggyItem) {
    result.errors.push('pluggy_item not found in DB')
    return result
  }
  const contaBancariaId = pluggyItem.conta_bancaria_id
  if (!contaBancariaId) {
    result.errors.push('pluggy_item not linked to a conta_bancaria')
    return result
  }

  // 2. Sync window: last 30 days (idempotent — dedup via pluggy_transaction_id)
  const today = new Date()
  const from = new Date(today.getTime() - 30 * 86400_000).toISOString().slice(0, 10)
  const to = today.toISOString().slice(0, 10)

  // 3. Fetch transactions
  let transactions
  try {
    transactions = await listTransactions({ pluggyItemId, from, to })
  } catch (e) {
    result.errors.push(`Pluggy fetch failed: ${(e as Error).message}`)
    return result
  }

  // 4. Load supporting data for categorization
  const { data: regrasRows } = await admin.from('regras_categorizacao').select('*').eq('ativa', true)
  const { data: categoriasRows } = await admin.from('categorias').select('id, nome').eq('ativa', true)
  const { data: historicoRows } = await admin
    .from('lancamentos')
    .select('descricao, categoria_id, fornecedor_id')
    .not('categoria_id', 'is', null)
    .gte('data', new Date(today.getTime() - 180 * 86400_000).toISOString().slice(0, 10))
    .limit(500)

  const regras = (regrasRows ?? []) as Regra[]
  const categorias = (categoriasRows ?? []).map((c) => ({ id: c.id, nome: c.nome }))
  const historico = (historicoRows ?? []).map((h) => ({
    descricao: h.descricao,
    categoria_id: h.categoria_id as string,
    fornecedor_id: h.fornecedor_id as string | null,
  }))

  // 5. Insert each transaction (idempotent on pluggy_transaction_id)
  for (const tx of transactions) {
    // Check dedup
    const { data: existing } = await admin
      .from('lancamentos').select('id').eq('pluggy_transaction_id', tx.id).maybeSingle()
    if (existing) {
      result.skipped++
      continue
    }

    // Categorize
    const cat = await categorizar({
      descricao: tx.description,
      valor: Math.abs(tx.amount),
      regras,
      historico,
      categorias,
    })

    const tipo: 'entrada' | 'saida' = tx.amount > 0 ? 'entrada' : 'saida'

    const insertObj = {
      data: tx.date,
      valor: Math.abs(tx.amount),
      conta_id: contaBancariaId,
      tipo,
      categoria_id: cat.pendente ? null : cat.categoria_id,
      descricao: tx.description,
      origem: 'pluggy' as const,
      conciliado: false,
      pluggy_transaction_id: tx.id,
      categorizacao_metodo: cat.metodo,
      categorizacao_confianca: cat.confianca,
    }

    const { error: insErr } = await admin.from('lancamentos').insert(insertObj)
    if (insErr) {
      result.errors.push(`insert ${tx.id}: ${insErr.message}`)
      continue
    }

    result.inserted++
    if (cat.pendente) result.pendentes++
    else result.categorizados++
  }

  // 6. Update sync status
  try {
    const itemStatus = await getItem(pluggyItemId)
    await admin.from('pluggy_items')
      .update({ status: itemStatus.status, last_synced_at: new Date().toISOString() })
      .eq('id', pluggyItem.id)
  } catch (e) {
    result.errors.push(`status update: ${(e as Error).message}`)
  }

  return result
}
```

- [ ] **Step 2:** Typecheck.
- [ ] **Step 3:** Commit: `feat(bancos): sync Pluggy transactions → lancamentos with inline cascade`

---

### Task 12: Conciliation orchestrator service

**File:** `src/modules/bancos/conciliar.ts` (different from `conciliacao.ts` — `conciliar.ts` is the server-side orchestrator).

```ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { classificarBreak, type Candidato, type LancamentoBank } from './conciliacao'

export async function conciliarPendentes(): Promise<{
  processados: number
  matched: number
  sugestoes: number
}> {
  const admin = createServiceClient()
  let processados = 0, matched = 0, sugestoes = 0

  // Fetch Pluggy lancamentos awaiting conciliation
  const { data: lancs } = await admin
    .from('lancamentos')
    .select('id, data, valor, descricao, tipo')
    .eq('origem', 'pluggy')
    .eq('conciliado', false)
    .limit(100)

  for (const l of lancs ?? []) {
    processados++
    const lanc: LancamentoBank = {
      id: l.id, data: l.data, valor: Number(l.valor), descricao: l.descricao, tipo: l.tipo,
    }

    // Find candidatos within ±3 days window with value within 5% range
    const dayWindow = 3
    const from = addDays(l.data, -dayWindow)
    const to = addDays(l.data, dayWindow)

    const table = lanc.tipo === 'entrada' ? 'contas_a_receber' : 'contas_a_pagar'
    const statuses = lanc.tipo === 'entrada'
      ? ['previsto', 'emitido', 'atrasado']
      : ['previsto', 'aprovado', 'atrasado']
    const minVal = lanc.valor * 0.95, maxVal = lanc.valor * 1.05

    const { data: cands } = await admin
      .from(table)
      .select('id, valor, data_vencimento, descricao:observacoes')   // observacoes as descricao approx
      .gte('data_vencimento', from).lte('data_vencimento', to)
      .gte('valor', minVal).lte('valor', maxVal)
      .in('status', statuses)
      .limit(20)

    const candidatos: Candidato[] = (cands ?? []).map((c) => ({
      id: c.id,
      valor: Number(c.valor),
      data_vencimento: c.data_vencimento,
      descricao: (c.descricao as string | null) ?? '',
      tipo: lanc.tipo === 'entrada' ? 'ar' : 'ap',
    }))

    const classification = classificarBreak(lanc, candidatos)

    if (classification.classificacao === 'matched' && classification.melhor_match_id) {
      // Auto-link: update AP/AR with lancamento_id + status → received/paid
      const updateTable = lanc.tipo === 'entrada' ? 'contas_a_receber' : 'contas_a_pagar'
      const newStatus = lanc.tipo === 'entrada' ? 'recebido' : 'pago'
      const dateField = lanc.tipo === 'entrada' ? 'data_recebimento' : 'data_pagamento'

      await admin.from(updateTable).update({
        status: newStatus,
        [dateField]: lanc.data,
        lancamento_id: lanc.id,
      }).eq('id', classification.melhor_match_id)
      await admin.from('lancamentos').update({ conciliado: true }).eq('id', lanc.id)
      matched++
    } else {
      // Queue as sugestao
      await admin.from('sugestoes_conciliacao').insert({
        lancamento_id: lanc.id,
        candidato_tipo: lanc.tipo === 'entrada' ? 'ar' : 'ap',
        candidato_id: classification.melhor_match_id,
        break_tipo: classification.classificacao,
        score: classification.score,
        explicacao: classification.explicacao,
      })
      sugestoes++
    }
  }

  return { processados, matched, sugestoes }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
```

- [ ] Typecheck + commit: `feat(bancos): conciliar orchestrator (auto-link matched + queue sugestoes)`

---

### Task 13: Cron endpoints + fill prompts

Three endpoints, all auth via `Authorization: Bearer ${CRON_SECRET}`:

**`src/app/api/cron/sync-pluggy/route.ts`** — fetches all `pluggy_items` with `status='updated'` and calls `syncPluggyItem` for each. Returns aggregated stats.

**`src/app/api/cron/categorizar-pendentes/route.ts`** — selects `lancamentos` with `categoria_id IS NULL` (pendente), runs categorizar() on each, updates categoria_id + categorizacao_metodo if confidence > 0.7.

**`src/app/api/cron/conciliar/route.ts`** — wraps `conciliarPendentes()`.

**Fill in prompts:**
- Edit `prompts/categorizacao/SKILL.md`: replace body sections with concrete prompt text. Focus on:
  - Lista de categorias é dinâmica, vem no input
  - Foco no driver (não parafrasear a descrição)
  - Materiality: se valor < R$ 50, baixa precisão é aceitável
  - Output JSON estrito conforme `CategoriaSuggestion`

- Edit `prompts/reconciliacao/SKILL.md`: concrete prompt for break classification. Reference the 7-class taxonomy explicitly, and instruction to set `melhor_match_id=null` when classificacao is bank-only or duplicate.

Smoke test for each endpoint (curl + Bearer auth). Each should return JSON. Commit:
```bash
git add prompts/ src/app/api/cron
git commit -m "feat(api): cron endpoints (sync-pluggy, categorizar-pendentes, conciliar) + fill prompt skills"
```

---

### Task 14: UI — Bancos config + Regras CRUD + Pendências + Conciliação

This task creates multiple pages. Suggested grouping (single commit):

**`/config/bancos/page.tsx`** — lists `pluggy_items` with status badge, link to Pluggy dashboard for connecting new items (real flow needs Pluggy Connect — defer the widget). For dev mode, has a button "Add mock item" that inserts a fake `pluggy_items` row tied to a conta_bancaria.

**`/config/regras-categorizacao/page.tsx`** + `novo/page.tsx` + `[id]/page.tsx` — full CRUD for regras. The form has fields: pattern, pattern_tipo, campo, categoria (select), prioridade, ativa.

**`/pendencias/page.tsx`** — list of `lancamentos` where `categoria_id IS NULL` OR (`categorizacao_metodo='llm'` AND `categorizacao_confianca < 0.7`). For each row, dropdown to pick categoria + "Salvar" button + "Criar regra a partir disto" button (opens regra modal pre-filled).

**`/conciliacao/page.tsx`** — list of `sugestoes_conciliacao` where `status='pendente'`. Columns: lancamento (data + valor + descricao), candidato (AP/AR id + valor), break_tipo (badge), score, explicacao, actions [Aceitar | Rejeitar]. Aceitar: links lancamento to candidato, marks sugestao=aceita, updates AP/AR status.

Build + commit:
```bash
npm run build
git add -A
git commit -m "feat(ui): bancos config + regras CRUD + pendencias + conciliacao queues"
```

---

### Task 15: Integration tests

**File:** `tests/integration/cascata-completa.test.ts` + `tests/integration/conciliacao-auto.test.ts`.

Both tests use SUPABASE_SERVICE_ROLE_KEY directly.

**cascata-completa.test.ts:**
1. Insert categoria + regra (`pattern='AWS'`)
2. Call `categorizar({ descricao: 'AWS Cloud Services', ..., regras: [<rule>], categorias: [<cat>] })`
3. Assert metodo='regra', confianca=1.0

**conciliacao-auto.test.ts:**
1. Insert cliente + AR (previsto, valor=1000, data_vencimento=2026-05-10)
2. Insert lancamento Pluggy (origem='pluggy', conciliado=false, tipo=entrada, valor=1000, data=2026-05-10)
3. Call `conciliarPendentes()`
4. Assert AR.status=='recebido', AR.lancamento_id == lancamento.id, lancamento.conciliado==true

Commit: `test(integration): cascata + conciliacao auto-resolution flows`

---

### Task 16: Verification & phase wrap-up

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
export SUPABASE_SERVICE_ROLE_KEY=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY=" .env.local | cut -d= -f2-)
npm run test:int
npm run test:e2e
npm run build
```

Update README: `| 4 ✅ | Bancos (Pluggy) + Categorização |`. Commit: `docs: mark Phase 4 complete in roadmap`.

---

## Acceptance Criteria

- [ ] All lint/typecheck/test tiers green
- [ ] Migrations 0021-0023 apply cleanly
- [ ] LLM_MODE=mock works end-to-end; LLM_MODE=real correctly invokes Anthropic SDK with caching
- [ ] PLUGGY_MODE=mock returns fixture transactions; PLUGGY_MODE=real authenticates + fetches
- [ ] Cascade: regra > historico > LLM order; confidence <=0.7 → pendente
- [ ] Break taxonomy correctly classifies 7 cases (matched, timing-break, amount-break, mapping-issue, duplicate, bank-only, ledger-only)
- [ ] Auto-conciliacao: score >=0.8 → links AP/AR + marks `conciliado=true`
- [ ] Sugestoes queue populated otherwise
- [ ] Pendências UI: dropdown updates categoria + button to create regra
- [ ] Prompts (categorizacao + reconciliacao SKILL.md) have actual body, no placeholders
