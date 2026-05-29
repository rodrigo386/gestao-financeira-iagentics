# Fase 5 — Forecast + Alertas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project 12 months of MRR, revenue, expenses, cash balance, and runway under 3 scenarios (Best / Base / Worst), driven by editable assumptions (drivers). Surface 6 categories of alerts (runway, AP/AR atrasado, contrato vencendo, despesa anômala, caixa baixo) via a daily cron, persistent inbox with read state, and optional email delivery via Resend.

**Architecture:**
- `forecast_cenarios` (drivers JSON) + materialized `forecast_projecoes` (computed per (cenario, mes_ref)). Recompute on driver change via `gerar_forecast()`.
- `alertas` table — append-only inbox with `lido` flag. Cron `/api/cron/avaliar-alertas` runs daily, evaluates 6 rules, dedups (same tipo+contexto in last 24h skipped), creates `alertas` rows, sends email if severity ≥ warning.
- Engine is a **pure function**: given snapshot of (contratos, projetos, despesas_recorrentes, folha atual total, caixa atual, drivers), returns 12-month projection. Easy to TDD.
- Resend integration follows the mock-first pattern (`RESEND_MODE=mock|real`).

**Tech Stack:** Same as Phase 4 + `resend` SDK for email (mock + real). `recharts` for forecast chart (already shadcn-compatible).

**Out of scope** (deferred):
- Variance commentary widget on dashboard — Phase 6 (uses `prompts/commentary/SKILL.md`)
- Sensitivity analysis / what-if interactive sliders — Phase 6 polish
- Cohort retention analysis
- ML-based forecast — out of scope (drivers-only)

**Prerequisites:** Phase 4 complete on `master`, last commit `~78cfa68 area`. 23 migrations. 97 commits total.

---

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/0024_forecast_cenarios.sql` | Scenarios with drivers JSON + seeds (Best/Base/Worst) |
| `supabase/migrations/0025_forecast_projecoes.sql` | Materialized projections per (cenario, mes_ref) |
| `supabase/migrations/0026_alertas.sql` | Notification inbox |
| `src/lib/schemas/cenario.ts` | Zod |
| `src/lib/schemas/alerta.ts` | Zod |
| `src/lib/email/client.ts` | Resend wrapper (mock + real) |
| `src/modules/forecast/engine.ts` | Pure projection engine (TDD) |
| `src/modules/forecast/cenarios.ts` | CRUD + recompute trigger |
| `src/modules/forecast/snapshot.ts` | Loads input snapshot from DB |
| `src/modules/alertas/regras.ts` | 6 alert rule evaluators (TDD) |
| `src/modules/alertas/notificador.ts` | Create alert + email send |
| `src/app/api/cron/avaliar-alertas/route.ts` | Daily eval endpoint |
| `src/app/(dashboard)/forecast/page.tsx` | Scenario picker, drivers editor, chart, runway |
| `src/app/(dashboard)/alertas/page.tsx` | Inbox with mark-as-read |
| `src/components/forecast-chart.tsx` | Recharts: 3 lines (Best/Base/Worst caixa over time) |
| `src/components/drivers-form.tsx` | Inline form for editing cenario drivers |
| `src/components/alertas-bell.tsx` | Sidebar bell w/ unread count + dropdown preview |
| `tests/unit/modules/forecast/engine.test.ts` | Engine TDD |
| `tests/unit/modules/alertas/regras.test.ts` | Each rule TDD |
| `tests/integration/forecast-recompute.test.ts` | Driver change → forecast_projecoes updated |
| `tests/integration/alertas-evaluator.test.ts` | Eval cron produces correct alertas |

---

## Tasks

### Task 1: Migration 0024 — forecast_cenarios

- [ ] **Step 1:** `supabase migration new forecast_cenarios && mv supabase/migrations/*_forecast_cenarios.sql supabase/migrations/0024_forecast_cenarios.sql`

- [ ] **Step 2:**

```sql
create table public.forecast_cenarios (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  drivers_json  jsonb not null,
  -- {
  --   "novos_clientes_mes": 1,
  --   "churn_pct": 2,           // % por mês
  --   "ticket_medio_novo": 1500,
  --   "novos_projetos_mes": 0.5,
  --   "valor_medio_projeto": 30000,
  --   "duracao_projeto_meses": 3,
  --   "crescimento_despesa_pct": 1   // % por mês
  -- }
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger forecast_cenarios_atualizado_em
  before update on public.forecast_cenarios
  for each row execute function public.tg_set_atualizado_em();

alter table public.forecast_cenarios enable row level security;

create policy "cenarios_select_authenticated"
  on public.forecast_cenarios for select to authenticated using (true);

create policy "cenarios_modify_can_write"
  on public.forecast_cenarios for all to authenticated
  using (public.can_write()) with check (public.can_write());

-- Seed: Best / Base / Worst
insert into public.forecast_cenarios (nome, drivers_json) values
('Base', '{
  "novos_clientes_mes": 1,
  "churn_pct": 2,
  "ticket_medio_novo": 1500,
  "novos_projetos_mes": 0.5,
  "valor_medio_projeto": 30000,
  "duracao_projeto_meses": 3,
  "crescimento_despesa_pct": 1
}'::jsonb),
('Best', '{
  "novos_clientes_mes": 2,
  "churn_pct": 1,
  "ticket_medio_novo": 2000,
  "novos_projetos_mes": 1,
  "valor_medio_projeto": 40000,
  "duracao_projeto_meses": 3,
  "crescimento_despesa_pct": 0.5
}'::jsonb),
('Worst', '{
  "novos_clientes_mes": 0.5,
  "churn_pct": 5,
  "ticket_medio_novo": 1000,
  "novos_projetos_mes": 0.2,
  "valor_medio_projeto": 20000,
  "duracao_projeto_meses": 3,
  "crescimento_despesa_pct": 2
}'::jsonb);
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit: `feat(db): add forecast_cenarios with Best/Base/Worst seeds`

---

### Task 2: Migration 0025 — forecast_projecoes

- [ ] **Step 1:** `supabase migration new forecast_projecoes && mv supabase/migrations/*_forecast_projecoes.sql supabase/migrations/0025_forecast_projecoes.sql`

- [ ] **Step 2:**

```sql
create table public.forecast_projecoes (
  cenario_id    uuid not null references public.forecast_cenarios(id) on delete cascade,
  mes_ref       date not null,
  mrr           numeric(14,2) not null,
  receita_total numeric(14,2) not null,
  despesa_total numeric(14,2) not null,
  caixa         numeric(14,2) not null,
  runway_meses  numeric(6,1),   -- null when > 36 months
  gerado_em     timestamptz not null default now(),
  primary key (cenario_id, mes_ref),
  constraint projecao_mes_dia_um check (extract(day from mes_ref) = 1)
);

create index forecast_projecoes_cenario on public.forecast_projecoes (cenario_id, mes_ref);

alter table public.forecast_projecoes enable row level security;

create policy "projecoes_select_authenticated"
  on public.forecast_projecoes for select to authenticated using (true);

create policy "projecoes_modify_can_write"
  on public.forecast_projecoes for all to authenticated
  using (public.can_write()) with check (public.can_write());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit: `feat(db): add forecast_projecoes (materialized per cenario+mes)`

---

### Task 3: Migration 0026 — alertas

- [ ] **Step 1:** `supabase migration new alertas && mv supabase/migrations/*_alertas.sql supabase/migrations/0026_alertas.sql`

- [ ] **Step 2:**

```sql
create type alerta_severidade as enum ('info', 'warning', 'critical');
create type alerta_tipo as enum (
  'runway_critico',
  'runway_atencao',
  'ap_atrasada',
  'ar_atrasada',
  'contrato_vencendo',
  'despesa_anomala',
  'caixa_baixo'
);

create table public.alertas (
  id            uuid primary key default gen_random_uuid(),
  tipo          alerta_tipo not null,
  severidade    alerta_severidade not null,
  titulo        text not null,
  mensagem      text not null,
  contexto_json jsonb,            -- { runway_meses, conta_id, ap_id, ar_id, etc }
  lido          boolean not null default false,
  lido_em       timestamptz,
  lido_por      uuid references public.usuarios(id) on delete set null,
  criado_em     timestamptz not null default now()
);

create index alertas_nao_lidos on public.alertas (criado_em desc) where lido = false;
create index alertas_tipo on public.alertas (tipo, criado_em desc);

-- prevent obvious duplicates: same tipo + a hash of contexto_json in last 24h
-- (enforced in code; uniqueness index is too restrictive for JSON contexts)

alter table public.alertas enable row level security;

create policy "alertas_select_authenticated"
  on public.alertas for select to authenticated using (true);

create policy "alertas_modify_can_write"
  on public.alertas for all to authenticated
  using (public.can_write()) with check (public.can_write());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit: `feat(db): add alertas inbox with 7 tipos and read state`

---

### Task 4: Zod schemas

**Files:** `src/lib/schemas/{cenario,alerta}.ts` + test.

- [ ] **Step 1:** Write failing test `tests/unit/schemas/forecast.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { NewCenario, Drivers } from '@/lib/schemas/cenario'
import { NewAlerta } from '@/lib/schemas/alerta'

describe('Drivers', () => {
  const valid = {
    novos_clientes_mes: 1,
    churn_pct: 2,
    ticket_medio_novo: 1500,
    novos_projetos_mes: 0.5,
    valor_medio_projeto: 30000,
    duracao_projeto_meses: 3,
    crescimento_despesa_pct: 1,
  }
  it('accepts valid drivers', () => {
    expect(Drivers.safeParse(valid).success).toBe(true)
  })
  it('rejects churn_pct > 100', () => {
    expect(Drivers.safeParse({ ...valid, churn_pct: 150 }).success).toBe(false)
  })
  it('rejects negative novos_clientes_mes', () => {
    expect(Drivers.safeParse({ ...valid, novos_clientes_mes: -1 }).success).toBe(false)
  })
})

describe('NewCenario', () => {
  it('accepts valid', () => {
    expect(NewCenario.safeParse({
      nome: 'Custom',
      drivers_json: {
        novos_clientes_mes: 1, churn_pct: 2, ticket_medio_novo: 1500,
        novos_projetos_mes: 0.5, valor_medio_projeto: 30000,
        duracao_projeto_meses: 3, crescimento_despesa_pct: 1,
      },
    }).success).toBe(true)
  })
})

describe('NewAlerta', () => {
  it('accepts valid', () => {
    expect(NewAlerta.safeParse({
      tipo: 'runway_critico',
      severidade: 'critical',
      titulo: 'Runway abaixo de 6 meses',
      mensagem: 'O cenário Base projeta runway de 4 meses',
    }).success).toBe(true)
  })
  it('rejects invalid tipo', () => {
    expect(NewAlerta.safeParse({
      tipo: 'invalido',
      severidade: 'info',
      titulo: 'X',
      mensagem: 'Y',
    }).success).toBe(false)
  })
})
```

- [ ] **Step 2:** Implement:

`src/lib/schemas/cenario.ts`:
```ts
import { z } from 'zod'
import { Uuid } from './common'

export const Drivers = z.object({
  novos_clientes_mes: z.number().nonnegative(),
  churn_pct: z.number().min(0).max(100),
  ticket_medio_novo: z.number().nonnegative(),
  novos_projetos_mes: z.number().nonnegative(),
  valor_medio_projeto: z.number().nonnegative(),
  duracao_projeto_meses: z.number().int().min(1),
  crescimento_despesa_pct: z.number().min(-100).max(100),
})

export const NewCenario = z.object({
  nome: z.string().min(1),
  drivers_json: Drivers,
  ativo: z.boolean().default(true),
})

export const Cenario = NewCenario.extend({
  id: Uuid,
  ativo: z.boolean(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type Drivers = z.infer<typeof Drivers>
export type NewCenario = z.infer<typeof NewCenario>
export type Cenario = z.infer<typeof Cenario>

export type Projecao = {
  cenario_id: string
  mes_ref: string
  mrr: number
  receita_total: number
  despesa_total: number
  caixa: number
  runway_meses: number | null
}
```

`src/lib/schemas/alerta.ts`:
```ts
import { z } from 'zod'
import { Uuid } from './common'

export const AlertaSeveridade = z.enum(['info', 'warning', 'critical'])
export const AlertaTipo = z.enum([
  'runway_critico', 'runway_atencao', 'ap_atrasada', 'ar_atrasada',
  'contrato_vencendo', 'despesa_anomala', 'caixa_baixo',
])

export const NewAlerta = z.object({
  tipo: AlertaTipo,
  severidade: AlertaSeveridade,
  titulo: z.string().min(1),
  mensagem: z.string().min(1),
  contexto_json: z.record(z.string(), z.unknown()).optional(),
})

export const Alerta = NewAlerta.extend({
  id: Uuid,
  contexto_json: z.record(z.string(), z.unknown()).nullable(),
  lido: z.boolean(),
  lido_em: z.string().nullable(),
  lido_por: Uuid.nullable(),
  criado_em: z.string(),
})

export type NewAlerta = z.infer<typeof NewAlerta>
export type Alerta = z.infer<typeof Alerta>
```

- [ ] **Step 3:** Run → expect ~6 tests pass.
- [ ] **Step 4:** Commit: `feat(schemas): zod for cenario + drivers + alerta`

---

### Task 5: Forecast engine (TDD)

**Files:** `src/modules/forecast/engine.ts` + test.

- [ ] **Step 1:** Write failing test `tests/unit/modules/forecast/engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { gerarForecast, type ForecastSnapshot } from '@/modules/forecast/engine'
import type { Drivers } from '@/lib/schemas/cenario'

const baseSnapshot: ForecastSnapshot = {
  mrrAtual: 5000,            // R$ 5k MRR
  caixaAtual: 100000,        // R$ 100k caixa
  despesaMensalAtual: 10000, // R$ 10k/mês despesa
  arPrevisto30d: 0,
  apPrevisto30d: 0,
  contratosAtivos: 5,
}

const baseDrivers: Drivers = {
  novos_clientes_mes: 1,
  churn_pct: 2,
  ticket_medio_novo: 1500,
  novos_projetos_mes: 0,
  valor_medio_projeto: 0,
  duracao_projeto_meses: 3,
  crescimento_despesa_pct: 1,
}

describe('gerarForecast', () => {
  it('returns 12 months', () => {
    const r = gerarForecast(baseSnapshot, baseDrivers, '2026-06-01', 12)
    expect(r).toHaveLength(12)
    expect(r[0]!.mes_ref).toBe('2026-06-01')
    expect(r[11]!.mes_ref).toBe('2027-05-01')
  })

  it('MRR evolves: mes 1 = mrrAtual*(1-churn/100) + novos*ticket', () => {
    const r = gerarForecast(baseSnapshot, baseDrivers, '2026-06-01', 2)
    // mrr[0] = 5000*(1-0.02) + 1*1500 = 4900 + 1500 = 6400
    expect(r[0]!.mrr).toBeCloseTo(6400, 1)
    // mrr[1] = 6400*0.98 + 1500 = 6272 + 1500 = 7772
    expect(r[1]!.mrr).toBeCloseTo(7772, 1)
  })

  it('despesa grows at crescimento_despesa_pct compounded', () => {
    const r = gerarForecast(baseSnapshot, baseDrivers, '2026-06-01', 3)
    // despesa[0] = 10000 * 1.01 = 10100
    expect(r[0]!.despesa_total).toBeCloseTo(10100, 1)
    // despesa[1] = 10000 * 1.01^2 = 10201
    expect(r[1]!.despesa_total).toBeCloseTo(10201, 1)
  })

  it('caixa accumulates receita - despesa from caixaAtual', () => {
    const r = gerarForecast(baseSnapshot, baseDrivers, '2026-06-01', 1)
    // caixa[0] = 100000 + (6400 receita) - (10100 despesa) = 96300
    expect(r[0]!.caixa).toBeCloseTo(96300, 1)
  })

  it('runway becomes null when caixa stays > 0 for full horizon', () => {
    const snap = { ...baseSnapshot, caixaAtual: 1_000_000 }
    const r = gerarForecast(snap, baseDrivers, '2026-06-01', 12)
    expect(r[0]!.runway_meses).toBeNull()
  })

  it('runway returns # of months until caixa < 0', () => {
    const snap = { ...baseSnapshot, caixaAtual: 20000 }  // small caixa
    const r = gerarForecast(snap, baseDrivers, '2026-06-01', 12)
    // Negative caixa starting at some month
    const firstNeg = r.findIndex((p) => p.caixa < 0)
    expect(firstNeg).toBeGreaterThan(0)
    expect(r[0]!.runway_meses).toBe(firstNeg)
  })

  it('includes projeto revenue distributed over duracao_projeto_meses', () => {
    const drivers = { ...baseDrivers, novos_projetos_mes: 1, valor_medio_projeto: 30000, duracao_projeto_meses: 3 }
    const r = gerarForecast(baseSnapshot, drivers, '2026-06-01', 4)
    // mes 1: 1 novo projeto, primeiro mes = 30000/3 = 10000
    // mes 2: 1 novo projeto novamente + 2o mes do anterior = 10000 + 10000 = 20000
    // mes 3: 1 novo + 2o do mes 2 + 3o do mes 1 = 10000 + 10000 + 10000 = 30000
    // receita = mrr + receita_projeto
    const projeto0 = r[0]!.receita_total - r[0]!.mrr
    expect(projeto0).toBeCloseTo(10000, 1)
    const projeto2 = r[2]!.receita_total - r[2]!.mrr
    expect(projeto2).toBeCloseTo(30000, 1)
  })
})
```

- [ ] **Step 2:** Implement `src/modules/forecast/engine.ts`:

```ts
import type { Drivers, Projecao } from '@/lib/schemas/cenario'

export type ForecastSnapshot = {
  mrrAtual: number
  caixaAtual: number
  despesaMensalAtual: number
  arPrevisto30d: number
  apPrevisto30d: number
  contratosAtivos: number
}

/**
 * Pure projection engine. Returns horizonMeses entries from startMes (inclusive).
 *
 * Forward model:
 *   mrr[t]            = mrr[t-1] * (1 - churn/100) + novos_clientes * ticket_medio
 *   receita_projeto[t] = sum(projetos started at t..t-(duracao-1))) * (valor / duracao)
 *   receita[t]        = mrr[t] + receita_projeto[t]
 *   despesa[t]        = despesa_atual * (1 + crescimento/100)^(t+1)
 *   caixa[t]          = caixa[t-1] + receita[t] - despesa[t]   (caixa[-1] = caixaAtual)
 *   runway            = first t where caixa[t] < 0, OR null if caixa stays >= 0
 *                       The runway field is the SAME for every projection row (it's a horizon-wide metric).
 */
export function gerarForecast(
  snapshot: ForecastSnapshot,
  drivers: Drivers,
  startMes: string,
  horizonMeses: number,
): Projecao[] {
  const out: Projecao[] = []
  let mrr = snapshot.mrrAtual
  let caixa = snapshot.caixaAtual

  // Pass 1: compute MRR / receita_projeto / despesa / caixa per month
  for (let t = 0; t < horizonMeses; t++) {
    // MRR evolution
    mrr = mrr * (1 - drivers.churn_pct / 100) + drivers.novos_clientes_mes * drivers.ticket_medio_novo

    // Projeto revenue: sum contributions from each active cohort
    let receitaProjeto = 0
    for (let cohort = Math.max(0, t - drivers.duracao_projeto_meses + 1); cohort <= t; cohort++) {
      // cohort started at month `cohort`; current month is `t`
      receitaProjeto += drivers.novos_projetos_mes * (drivers.valor_medio_projeto / drivers.duracao_projeto_meses)
    }

    const receita = mrr + receitaProjeto
    const despesa = snapshot.despesaMensalAtual * Math.pow(1 + drivers.crescimento_despesa_pct / 100, t + 1)
    caixa = caixa + receita - despesa

    out.push({
      cenario_id: '',  // filled by caller
      mes_ref: addMonths(startMes, t),
      mrr: round2(mrr),
      receita_total: round2(receita),
      despesa_total: round2(despesa),
      caixa: round2(caixa),
      runway_meses: null,  // computed in pass 2
    })
  }

  // Pass 2: compute runway (horizon-wide metric)
  let runway: number | null = null
  for (let t = 0; t < out.length; t++) {
    if (out[t]!.caixa < 0) {
      runway = t
      break
    }
  }
  for (const p of out) p.runway_meses = runway

  return out
}

function addMonths(dateStr: string, months: number): string {
  const parts = dateStr.split('-').map(Number)
  const y0 = parts[0]!
  const m0 = parts[1]!
  const total = (y0 * 12) + (m0 - 1) + months
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
```

- [ ] **Step 3:** Run → expect 7 tests pass.
- [ ] **Step 4:** Commit: `feat(forecast): pure projection engine (MRR + projetos + despesa + caixa + runway) (TDD)`

---

### Task 6: Snapshot loader

**File:** `src/modules/forecast/snapshot.ts`.

Loads current real-world snapshot from DB. Not heavily tested — just a query gatherer.

```ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import type { ForecastSnapshot } from './engine'
import type { Contrato } from '@/lib/schemas/contrato'
import { calcularMRR } from '@/modules/receitas/metricas'

export async function loadSnapshot(refDate: string): Promise<ForecastSnapshot> {
  const admin = createServiceClient()

  // Active contracts → MRR
  const { data: contratosRows } = await admin.from('contratos').select('*').eq('status', 'ativo')
  const contratos = (contratosRows ?? []) as Contrato[]
  const mrrAtual = calcularMRR(contratos, refDate)

  // Caixa atual: sum saldo_atual de contas_bancarias ativas
  const { data: contas } = await admin
    .from('contas_bancarias').select('saldo_atual').eq('ativa', true)
  const caixaAtual = (contas ?? []).reduce((s, c) => s + Number(c.saldo_atual), 0)

  // Despesa mensal atual: média dos últimos 90 dias de lancamentos saida
  const ninetyAgo = new Date(new Date(refDate).getTime() - 90 * 86400_000).toISOString().slice(0, 10)
  const { data: lancs } = await admin
    .from('lancamentos').select('valor')
    .eq('tipo', 'saida').gte('data', ninetyAgo).lt('data', refDate)
  const totalSaida90d = (lancs ?? []).reduce((s, l) => s + Number(l.valor), 0)
  const despesaMensalAtual = totalSaida90d / 3   // 3 months

  // AR/AP next 30d
  const in30 = new Date(new Date(refDate).getTime() + 30 * 86400_000).toISOString().slice(0, 10)
  const { data: ars } = await admin
    .from('contas_a_receber').select('valor')
    .in('status', ['previsto', 'emitido', 'atrasado'])
    .gte('data_vencimento', refDate).lte('data_vencimento', in30)
  const arPrevisto30d = (ars ?? []).reduce((s, a) => s + Number(a.valor), 0)

  const { data: aps } = await admin
    .from('contas_a_pagar').select('valor')
    .in('status', ['previsto', 'aprovado', 'atrasado'])
    .gte('data_vencimento', refDate).lte('data_vencimento', in30)
  const apPrevisto30d = (aps ?? []).reduce((s, a) => s + Number(a.valor), 0)

  return {
    mrrAtual: round2(mrrAtual),
    caixaAtual: round2(caixaAtual),
    despesaMensalAtual: round2(despesaMensalAtual),
    arPrevisto30d: round2(arPrevisto30d),
    apPrevisto30d: round2(apPrevisto30d),
    contratosAtivos: contratos.filter((c) => c.status === 'ativo').length,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
```

Typecheck + commit:
```bash
npx tsc --noEmit
git add src/modules/forecast/snapshot.ts
git commit -m "feat(forecast): snapshot loader (MRR + caixa + despesa media + AR/AP)"
```

---

### Task 7: Cenarios service + recompute trigger

**File:** `src/modules/forecast/cenarios.ts`.

```ts
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NewCenario, Cenario } from '@/lib/schemas/cenario'
import { gerarForecast } from './engine'
import { loadSnapshot } from './snapshot'
import type { z } from 'zod'

export async function listarCenarios() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('forecast_cenarios').select('*').order('nome', { ascending: true })
  if (error) throw new Error(`listarCenarios: ${error.message}`)
  return (data ?? []) as Cenario[]
}

export async function buscarCenario(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('forecast_cenarios').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarCenario: ${error.message}`)
  return data as Cenario | null
}

export async function atualizarCenario(id: string, input: Partial<z.input<typeof NewCenario>>) {
  const parsed = NewCenario.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('forecast_cenarios').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarCenario: ${error.message}`)
  return data as Cenario
}

/**
 * Recompute projections for one or all cenarios. Persists to forecast_projecoes.
 */
export async function recomputarProjecoes(cenarioId?: string, horizonMeses = 12) {
  const admin = createServiceClient()
  const today = new Date()
  const startMes = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const snapshot = await loadSnapshot(startMes)

  let cenarios: Cenario[]
  if (cenarioId) {
    const { data } = await admin.from('forecast_cenarios').select('*').eq('id', cenarioId)
    cenarios = (data ?? []) as Cenario[]
  } else {
    const { data } = await admin.from('forecast_cenarios').select('*').eq('ativo', true)
    cenarios = (data ?? []) as Cenario[]
  }

  for (const c of cenarios) {
    const projecoes = gerarForecast(snapshot, c.drivers_json as never, startMes, horizonMeses)
      .map((p) => ({ ...p, cenario_id: c.id }))

    // Replace existing projections for this cenario
    await admin.from('forecast_projecoes').delete().eq('cenario_id', c.id)
    await admin.from('forecast_projecoes').insert(projecoes)
  }

  return { recomputed: cenarios.length }
}
```

Typecheck + commit:
```bash
npx tsc --noEmit
git add src/modules/forecast/cenarios.ts
git commit -m "feat(forecast): cenarios CRUD + recomputarProjecoes service"
```

---

### Task 8: Email client (Resend mock + real)

**Files:** `src/lib/email/client.ts` + test.

- [ ] **Step 1:** Install:
```bash
npm install resend
```

Add to `.env.example`:
```
RESEND_MODE=mock
RESEND_API_KEY=
EMAIL_FROM=alertas@iagentics.com
EMAIL_TO_ADMINS=
```

Add to `.env.local`:
```
RESEND_MODE=mock
EMAIL_FROM=alertas@iagentics.test
EMAIL_TO_ADMINS=admin@iagentics.test
```

- [ ] **Step 2:** Write failing test `tests/unit/lib/email/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Email client (mock)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.RESEND_MODE = 'mock'
    process.env.EMAIL_FROM = 'test@iagentics.test'
    process.env.EMAIL_TO_ADMINS = 'admin@iagentics.test'
  })

  it('sendAlertaEmail returns mock id without throwing', async () => {
    const { sendAlertaEmail } = await import('@/lib/email/client')
    const result = await sendAlertaEmail({
      to: ['user@test.com'],
      subject: 'Test Alert',
      severidade: 'warning',
      titulo: 'Test',
      mensagem: 'Mensagem',
    })
    expect(result.id).toMatch(/^mock-/)
  })

  it('respects EMAIL_TO_ADMINS as default', async () => {
    const { sendAlertaEmail } = await import('@/lib/email/client')
    const result = await sendAlertaEmail({
      subject: 'Test', severidade: 'info', titulo: 'X', mensagem: 'Y',
    })
    expect(result.id).toMatch(/^mock-/)
  })
})
```

- [ ] **Step 3:** Implement `src/lib/email/client.ts`:

```ts
import 'server-only'
import { Resend } from 'resend'
import type { AlertaSeveridade } from '@/lib/schemas/alerta'

type SendInput = {
  to?: string[]                 // default: EMAIL_TO_ADMINS split by comma
  subject: string
  severidade: 'info' | 'warning' | 'critical'
  titulo: string
  mensagem: string
  contexto_json?: Record<string, unknown>
}

export async function sendAlertaEmail(input: SendInput): Promise<{ id: string }> {
  if (process.env.RESEND_MODE !== 'real') {
    return { id: `mock-${Date.now()}` }
  }
  return realSend(input)
}

let _client: Resend | null = null
function getClient() {
  if (_client) return _client
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY required when RESEND_MODE=real')
  _client = new Resend(apiKey)
  return _client
}

async function realSend(input: SendInput): Promise<{ id: string }> {
  const client = getClient()
  const from = process.env.EMAIL_FROM
  if (!from) throw new Error('EMAIL_FROM required when RESEND_MODE=real')

  const to = input.to ?? (process.env.EMAIL_TO_ADMINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (to.length === 0) throw new Error('No recipients (EMAIL_TO_ADMINS not set)')

  const html = `
<h2 style="color: ${colorOf(input.severidade)};">${input.titulo}</h2>
<p>${input.mensagem}</p>
${input.contexto_json ? `<pre style="background:#f5f5f5;padding:8px;font-size:11px;">${JSON.stringify(input.contexto_json, null, 2)}</pre>` : ''}
<hr/>
<p style="font-size: 11px; color: #777;">IAgentics — Sistema de Gestão Financeira</p>
`.trim()

  const r = await client.emails.send({
    from, to, subject: input.subject, html,
  })
  if (r.error) throw new Error(`Resend: ${r.error.message}`)
  return { id: r.data?.id ?? 'sent' }
}

function colorOf(s: AlertaSeveridade): string {
  return s === 'critical' ? '#c00' : s === 'warning' ? '#c80' : '#06c'
}
```

- [ ] **Step 4:** Run → expect 2 tests pass.
- [ ] **Step 5:** Commit: `feat(email): Resend client with mock mode for alerta notifications`

---

### Task 9: Alertas rules evaluator (TDD)

**Files:** `src/modules/alertas/regras.ts` + test.

This is a pure function evaluating each of 6 rules against a snapshot + DB state.

- [ ] **Step 1:** Write failing test `tests/unit/modules/alertas/regras.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  avaliarRunway,
  avaliarAPAtrasada,
  avaliarARAtrasada,
  avaliarContratoVencendo,
  avaliarDespesaAnomala,
  avaliarCaixaBaixo,
} from '@/modules/alertas/regras'

const hoje = '2026-05-15'

describe('avaliarRunway', () => {
  it('returns null when runway > 12', () => {
    expect(avaliarRunway(15)).toBeNull()
    expect(avaliarRunway(null)).toBeNull()  // null = > horizon
  })
  it('emits warning when 6 < runway <= 12', () => {
    const a = avaliarRunway(8)!
    expect(a.tipo).toBe('runway_atencao')
    expect(a.severidade).toBe('warning')
  })
  it('emits critical when runway <= 6', () => {
    const a = avaliarRunway(4)!
    expect(a.tipo).toBe('runway_critico')
    expect(a.severidade).toBe('critical')
  })
})

describe('avaliarAPAtrasada', () => {
  it('returns null when no overdue', () => {
    expect(avaliarAPAtrasada([])).toBeNull()
  })
  it('emits warning when overdue exist', () => {
    const a = avaliarAPAtrasada([
      { id: 'ap1', descricao: 'AWS', valor: 500, data_vencimento: '2026-05-10' },
    ])!
    expect(a.severidade).toBe('warning')
    expect(a.tipo).toBe('ap_atrasada')
  })
})

describe('avaliarARAtrasada', () => {
  it('returns null when no overdue', () => {
    expect(avaliarARAtrasada([])).toBeNull()
  })
  it('emits warning when overdue exist', () => {
    const a = avaliarARAtrasada([
      { id: 'ar1', cliente_nome: 'Cliente X', valor: 1000, data_vencimento: '2026-05-10' },
    ])!
    expect(a.severidade).toBe('warning')
  })
})

describe('avaliarContratoVencendo', () => {
  it('returns null when none vencendo in 30-60d window', () => {
    expect(avaliarContratoVencendo([])).toBeNull()
  })
  it('emits info', () => {
    const a = avaliarContratoVencendo([
      { id: 'co1', cliente_nome: 'X', nome: 'Pro', data_fim: '2026-06-15' },
    ])!
    expect(a.severidade).toBe('info')
  })
})

describe('avaliarDespesaAnomala', () => {
  it('returns null when value <= 2x media', () => {
    expect(avaliarDespesaAnomala([
      { id: 'l1', valor: 100, descricao: 'X', categoria_nome: 'Tech', media_90d: 80 },
    ])).toBeNull()
  })
  it('emits warning when value > 2x media', () => {
    const a = avaliarDespesaAnomala([
      { id: 'l1', valor: 500, descricao: 'X', categoria_nome: 'Tech', media_90d: 100 },
    ])!
    expect(a.severidade).toBe('warning')
  })
})

describe('avaliarCaixaBaixo', () => {
  it('returns null when caixa above threshold', () => {
    expect(avaliarCaixaBaixo(50000, 30000)).toBeNull()
  })
  it('emits critical when below', () => {
    const a = avaliarCaixaBaixo(20000, 30000)!
    expect(a.severidade).toBe('critical')
    expect(a.tipo).toBe('caixa_baixo')
  })
})
```

- [ ] **Step 2:** Implement `src/modules/alertas/regras.ts`:

```ts
import type { NewAlerta } from '@/lib/schemas/alerta'

export function avaliarRunway(runwayMeses: number | null): NewAlerta | null {
  if (runwayMeses === null) return null
  if (runwayMeses <= 6) {
    return {
      tipo: 'runway_critico',
      severidade: 'critical',
      titulo: `Runway crítico: ${runwayMeses} meses`,
      mensagem: `O cenário Base projeta runway de apenas ${runwayMeses} meses. Ação imediata recomendada.`,
      contexto_json: { runway_meses: runwayMeses },
    }
  }
  if (runwayMeses <= 12) {
    return {
      tipo: 'runway_atencao',
      severidade: 'warning',
      titulo: `Runway abaixo de 12 meses (${runwayMeses})`,
      mensagem: `Cenário Base projeta runway de ${runwayMeses} meses.`,
      contexto_json: { runway_meses: runwayMeses },
    }
  }
  return null
}

export type APOverdueRow = { id: string; descricao: string; valor: number; data_vencimento: string }
export function avaliarAPAtrasada(overdue: APOverdueRow[]): NewAlerta | null {
  if (overdue.length === 0) return null
  const total = overdue.reduce((s, r) => s + r.valor, 0)
  return {
    tipo: 'ap_atrasada',
    severidade: 'warning',
    titulo: `${overdue.length} AP atrasada(s) — R$ ${total.toFixed(2)}`,
    mensagem: `${overdue.length} contas a pagar venceram. Revisar urgente.`,
    contexto_json: { ids: overdue.map((r) => r.id), total },
  }
}

export type AROverdueRow = { id: string; cliente_nome: string; valor: number; data_vencimento: string }
export function avaliarARAtrasada(overdue: AROverdueRow[]): NewAlerta | null {
  if (overdue.length === 0) return null
  const total = overdue.reduce((s, r) => s + r.valor, 0)
  return {
    tipo: 'ar_atrasada',
    severidade: 'warning',
    titulo: `${overdue.length} AR atrasada(s) — R$ ${total.toFixed(2)}`,
    mensagem: `${overdue.length} contas a receber estão em atraso. Acionar cobrança.`,
    contexto_json: { ids: overdue.map((r) => r.id), total },
  }
}

export type ContratoVencendo = { id: string; cliente_nome: string; nome: string; data_fim: string }
export function avaliarContratoVencendo(rows: ContratoVencendo[]): NewAlerta | null {
  if (rows.length === 0) return null
  return {
    tipo: 'contrato_vencendo',
    severidade: 'info',
    titulo: `${rows.length} contrato(s) vencem em 30–60 dias`,
    mensagem: `Iniciar conversa de renovação com: ${rows.map((r) => r.cliente_nome).join(', ')}`,
    contexto_json: { ids: rows.map((r) => r.id) },
  }
}

export type DespesaAnomalaRow = { id: string; valor: number; descricao: string; categoria_nome: string; media_90d: number }
export function avaliarDespesaAnomala(rows: DespesaAnomalaRow[]): NewAlerta | null {
  const anomalas = rows.filter((r) => r.valor > 2 * r.media_90d)
  if (anomalas.length === 0) return null
  return {
    tipo: 'despesa_anomala',
    severidade: 'warning',
    titulo: `${anomalas.length} despesa(s) acima de 2× média 90d`,
    mensagem: `Verificar: ${anomalas.slice(0, 3).map((a) => `${a.descricao} (R$ ${a.valor.toFixed(2)})`).join(', ')}`,
    contexto_json: { ids: anomalas.map((a) => a.id) },
  }
}

export function avaliarCaixaBaixo(caixaAtual: number, threshold: number): NewAlerta | null {
  if (caixaAtual >= threshold) return null
  return {
    tipo: 'caixa_baixo',
    severidade: 'critical',
    titulo: `Caixa abaixo do mínimo: R$ ${caixaAtual.toFixed(2)}`,
    mensagem: `Saldo consolidado das contas está abaixo de R$ ${threshold.toFixed(2)}.`,
    contexto_json: { caixa_atual: caixaAtual, threshold },
  }
}
```

- [ ] **Step 3:** Run → expect ~12 tests pass.
- [ ] **Step 4:** Commit: `feat(alertas): rule evaluators for 6 alert tipos (TDD)`

---

### Task 10: Notificador (DB persist + email)

**File:** `src/modules/alertas/notificador.ts`.

```ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { sendAlertaEmail } from '@/lib/email/client'
import type { NewAlerta } from '@/lib/schemas/alerta'

/**
 * Persists alert in DB (dedup: same tipo within last 24h skipped) and sends email if severity >= warning.
 */
export async function notificarAlerta(input: NewAlerta) {
  const admin = createServiceClient()

  // Dedup: was an alert of same tipo created in the last 24h?
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: recent } = await admin
    .from('alertas')
    .select('id')
    .eq('tipo', input.tipo)
    .gte('criado_em', oneDayAgo)
    .limit(1)
  if (recent && recent.length > 0) {
    return { skipped: true, reason: 'duplicate within 24h' }
  }

  // Insert
  const { data: alerta, error } = await admin.from('alertas').insert(input).select().single()
  if (error) throw new Error(`notificarAlerta insert: ${error.message}`)

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

  return { inserted: true, id: (alerta as { id: string }).id }
}
```

Typecheck + commit:
```bash
npx tsc --noEmit
git add src/modules/alertas/notificador.ts
git commit -m "feat(alertas): notificador (DB insert + dedup 24h + email warning+)"
```

---

### Task 11: Eval orchestrator + cron endpoint

**Files:** `src/modules/alertas/evaluator.ts` + `src/app/api/cron/avaliar-alertas/route.ts`.

`src/modules/alertas/evaluator.ts`:

```ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { recomputarProjecoes } from '@/modules/forecast/cenarios'
import { loadSnapshot } from '@/modules/forecast/snapshot'
import {
  avaliarRunway, avaliarAPAtrasada, avaliarARAtrasada,
  avaliarContratoVencendo, avaliarDespesaAnomala, avaliarCaixaBaixo,
} from './regras'
import { notificarAlerta } from './notificador'

const CAIXA_THRESHOLD_DEFAULT = 30000  // R$ 30k

export async function avaliarTodos(refDate: string) {
  const admin = createServiceClient()
  const stats = { evaluated: 0, notified: 0, skipped: 0 }

  // Recompute forecast first to get fresh runway
  await recomputarProjecoes()

  // Runway from Base cenario
  const { data: baseCen } = await admin.from('forecast_cenarios').select('id').eq('nome', 'Base').maybeSingle()
  let runwayMeses: number | null = null
  if (baseCen) {
    const { data: proj } = await admin
      .from('forecast_projecoes').select('runway_meses').eq('cenario_id', baseCen.id).limit(1).maybeSingle()
    runwayMeses = (proj?.runway_meses as number | null) ?? null
  }

  const runwayAlert = avaliarRunway(runwayMeses)
  if (runwayAlert) await notify(runwayAlert)

  // Caixa atual
  const snapshot = await loadSnapshot(refDate)
  const caixaAlert = avaliarCaixaBaixo(snapshot.caixaAtual, CAIXA_THRESHOLD_DEFAULT)
  if (caixaAlert) await notify(caixaAlert)

  // AP atrasadas
  const { data: aps } = await admin
    .from('contas_a_pagar')
    .select('id, descricao, valor, data_vencimento')
    .in('status', ['previsto', 'aprovado'])
    .lt('data_vencimento', refDate)
  const apAlert = avaliarAPAtrasada(((aps as Array<{ id: string; descricao: string; valor: string; data_vencimento: string }>) ?? []).map((a) => ({ ...a, valor: Number(a.valor) })))
  if (apAlert) await notify(apAlert)

  // AR atrasadas
  const { data: ars } = await admin
    .from('contas_a_receber')
    .select('id, valor, data_vencimento, cliente:clientes(nome)')
    .in('status', ['previsto', 'emitido'])
    .lt('data_vencimento', refDate)
  const arRows = ((ars as Array<{ id: string; valor: string; data_vencimento: string; cliente: { nome: string } | null }>) ?? [])
    .map((r) => ({ id: r.id, valor: Number(r.valor), data_vencimento: r.data_vencimento, cliente_nome: r.cliente?.nome ?? '' }))
  const arAlert = avaliarARAtrasada(arRows)
  if (arAlert) await notify(arAlert)

  // Contratos vencendo em 30-60d
  const in30 = new Date(new Date(refDate).getTime() + 30 * 86400_000).toISOString().slice(0, 10)
  const in60 = new Date(new Date(refDate).getTime() + 60 * 86400_000).toISOString().slice(0, 10)
  const { data: cons } = await admin
    .from('contratos')
    .select('id, nome, data_fim, cliente:clientes(nome)')
    .eq('status', 'ativo')
    .gte('data_fim', in30).lte('data_fim', in60)
  const conRows = ((cons as Array<{ id: string; nome: string; data_fim: string; cliente: { nome: string } | null }>) ?? [])
    .map((c) => ({ id: c.id, nome: c.nome, data_fim: c.data_fim, cliente_nome: c.cliente?.nome ?? '' }))
  const conAlert = avaliarContratoVencendo(conRows)
  if (conAlert) await notify(conAlert)

  // Despesa anômala: comparar lancamentos saida do dia vs média 90d por categoria
  const today = refDate
  const ninetyAgo = new Date(new Date(refDate).getTime() - 90 * 86400_000).toISOString().slice(0, 10)
  const { data: todays } = await admin
    .from('lancamentos')
    .select('id, valor, descricao, categoria_id, categoria:categorias(nome)')
    .eq('tipo', 'saida')
    .eq('data', today)
    .gt('valor', 0)

  const anomalas = []
  for (const l of (todays as Array<{ id: string; valor: string; descricao: string; categoria_id: string | null; categoria: { nome: string } | null }>) ?? []) {
    if (!l.categoria_id) continue
    const { data: media } = await admin
      .from('lancamentos')
      .select('valor')
      .eq('tipo', 'saida')
      .eq('categoria_id', l.categoria_id)
      .gte('data', ninetyAgo).lt('data', today)
    const vals = ((media as Array<{ valor: string }>) ?? []).map((v) => Number(v.valor))
    if (vals.length === 0) continue
    const m = vals.reduce((s, v) => s + v, 0) / vals.length
    anomalas.push({
      id: l.id,
      valor: Number(l.valor),
      descricao: l.descricao,
      categoria_nome: l.categoria?.nome ?? '',
      media_90d: m,
    })
  }
  const despAlert = avaliarDespesaAnomala(anomalas)
  if (despAlert) await notify(despAlert)

  async function notify(a: Parameters<typeof notificarAlerta>[0]) {
    stats.evaluated++
    const r = await notificarAlerta(a)
    if ('inserted' in r && r.inserted) stats.notified++
    else stats.skipped++
  }

  return stats
}
```

`src/app/api/cron/avaliar-alertas/route.ts`:

```ts
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { avaliarTodos } from '@/modules/alertas/evaluator'

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const stats = await avaliarTodos(today)
  return NextResponse.json(stats)
}
```

Smoke test:
```bash
npm run dev > /tmp/dev.log 2>&1 &
DEV_PID=$!
sleep 15
RES=$(curl -s -X POST -H "Authorization: Bearer local-dev-secret-change-me" "http://localhost:3000/api/cron/avaliar-alertas")
echo "Response: $RES"
NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3000/api/cron/avaliar-alertas")
echo "No-auth: $NOAUTH"
kill $DEV_PID 2>/dev/null || taskkill /F /PID $DEV_PID 2>/dev/null
sleep 2
```

If 3000 is busy, dev runs on 3001 — try that URL.

Typecheck + commit:
```bash
npx tsc --noEmit
git add src/modules/alertas/evaluator.ts src/app/api/cron/avaliar-alertas
git commit -m "feat(alertas): evaluator orchestrator + daily cron endpoint"
```

---

### Task 12: Forecast UI (page + chart + drivers form)

**Files:**
- `src/components/forecast-chart.tsx` (client; uses Recharts)
- `src/components/drivers-form.tsx` (client; for editing drivers)
- `src/app/(dashboard)/forecast/page.tsx` (server)

- [ ] **Step 1:** Install:
```bash
npm install recharts
```

- [ ] **Step 2:** Forecast chart component:

```tsx
'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

type ProjecaoRow = {
  mes_ref: string
  cenario_nome: string
  caixa: number
  receita_total: number
  despesa_total: number
}

const COLORS: Record<string, string> = {
  Base: '#0072B2',
  Best: '#009E73',
  Worst: '#D55E00',
}

export function ForecastChart({ rows }: { rows: ProjecaoRow[] }) {
  // Pivot to { mes_ref, Base, Best, Worst } per row
  const meses = Array.from(new Set(rows.map((r) => r.mes_ref))).sort()
  const data = meses.map((m) => {
    const obj: Record<string, number | string> = { mes_ref: m.slice(0, 7) }
    for (const r of rows.filter((x) => x.mes_ref === m)) {
      obj[r.cenario_nome] = r.caixa
    }
    return obj
  })

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="mes_ref" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
          <Legend />
          <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
          {Object.keys(COLORS).map((c) => (
            <Line key={c} type="monotone" dataKey={c} stroke={COLORS[c]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3:** Drivers form component:

```tsx
'use client'
import { useState } from 'react'
import type { Drivers } from '@/lib/schemas/cenario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const FIELDS: Array<{ key: keyof Drivers; label: string; step?: number; suffix?: string }> = [
  { key: 'novos_clientes_mes',     label: 'Novos clientes/mês',     step: 0.1 },
  { key: 'churn_pct',              label: 'Churn (%)',              step: 0.1, suffix: '%' },
  { key: 'ticket_medio_novo',      label: 'Ticket médio novo (R$)' },
  { key: 'novos_projetos_mes',     label: 'Novos projetos/mês',     step: 0.1 },
  { key: 'valor_medio_projeto',    label: 'Valor médio projeto (R$)' },
  { key: 'duracao_projeto_meses',  label: 'Duração projeto (meses)' },
  { key: 'crescimento_despesa_pct',label: 'Crescimento despesa (%)', step: 0.1, suffix: '%' },
]

export function DriversForm({ cenarioId, initialDrivers, onSubmit }: {
  cenarioId: string
  initialDrivers: Drivers
  onSubmit: (cenarioId: string, drivers: Drivers) => Promise<void>
}) {
  const [drivers, setDrivers] = useState<Drivers>(initialDrivers)
  const [saving, setSaving] = useState(false)

  return (
    <form onSubmit={async (e) => {
      e.preventDefault()
      setSaving(true)
      await onSubmit(cenarioId, drivers)
      setSaving(false)
    }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input
              id={f.key}
              type="number"
              step={f.step ?? 1}
              value={drivers[f.key]}
              onChange={(e) => setDrivers({ ...drivers, [f.key]: Number(e.target.value) })}
            />
          </div>
        ))}
      </div>
      <Button type="submit" disabled={saving} className="mt-4">
        {saving ? 'Recalculando...' : 'Salvar e recalcular'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 4:** Forecast page:

```tsx
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ForecastChart } from '@/components/forecast-chart'
import { DriversForm } from '@/components/drivers-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Drivers } from '@/lib/schemas/cenario'

export default async function ForecastPage() {
  const supabase = await createClient()

  const { data: cenarios } = await supabase
    .from('forecast_cenarios').select('*').eq('ativo', true).order('nome')

  // Trigger compute if no projecoes exist
  const { count: projecoesCount } = await supabase
    .from('forecast_projecoes').select('cenario_id', { count: 'exact', head: true })
  if ((projecoesCount ?? 0) === 0 && cenarios && cenarios.length > 0) {
    const { recomputarProjecoes } = await import('@/modules/forecast/cenarios')
    await recomputarProjecoes()
  }

  const { data: projecoes } = await supabase
    .from('forecast_projecoes')
    .select('*, cenario:forecast_cenarios(nome)')
    .order('mes_ref')

  const chartRows = ((projecoes as Array<{ mes_ref: string; cenario: { nome: string } | null; caixa: string; receita_total: string; despesa_total: string }>) ?? []).map((p) => ({
    mes_ref: p.mes_ref,
    cenario_nome: p.cenario?.nome ?? '',
    caixa: Number(p.caixa),
    receita_total: Number(p.receita_total),
    despesa_total: Number(p.despesa_total),
  }))

  // Runway summary
  const runways: Record<string, number | null> = {}
  for (const c of cenarios ?? []) {
    const row = (projecoes as Array<{ cenario_id: string; runway_meses: number | null }> | null)?.find((p) => p.cenario_id === c.id)
    runways[c.nome] = row?.runway_meses ?? null
  }

  async function salvarDrivers(cenarioId: string, drivers: Drivers) {
    'use server'
    const { atualizarCenario, recomputarProjecoes } = await import('@/modules/forecast/cenarios')
    await atualizarCenario(cenarioId, { drivers_json: drivers })
    await recomputarProjecoes(cenarioId)
    revalidatePath('/forecast')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Forecast</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(cenarios ?? []).map((c) => (
          <Card key={c.id}>
            <CardHeader><CardTitle>{c.nome}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-sm text-neutral-500">Runway</div>
              <div className="text-2xl font-semibold">
                {runways[c.nome] === null ? '> 36 meses' : `${runways[c.nome]} meses`}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Projeção de Caixa (12 meses)</CardTitle></CardHeader>
        <CardContent><ForecastChart rows={chartRows} /></CardContent>
      </Card>

      {(cenarios ?? []).map((c) => (
        <Card key={c.id}>
          <CardHeader><CardTitle>Drivers — {c.nome}</CardTitle></CardHeader>
          <CardContent>
            <DriversForm
              cenarioId={c.id}
              initialDrivers={c.drivers_json as Drivers}
              onSubmit={salvarDrivers}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

Build + commit:
```bash
npm run build
git add -A
git commit -m "feat(ui): forecast page with cenarios, drivers form, runway cards, chart"
```

---

### Task 13: Alertas UI (inbox + sidebar bell)

**Files:**
- `src/components/alertas-bell.tsx` (client)
- `src/app/(dashboard)/alertas/page.tsx`
- Update `src/components/sidebar.tsx` to integrate bell

- [ ] **Step 1:** Alertas inbox page:

```tsx
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const SEV_VARIANT: Record<string, 'default'|'secondary'|'destructive'|'outline'> = {
  info: 'secondary', warning: 'outline', critical: 'destructive',
}

export default async function AlertasPage() {
  const supabase = await createClient()
  const { data: alertas } = await supabase
    .from('alertas').select('*').order('criado_em', { ascending: false }).limit(200)

  async function marcarLido(formData: FormData) {
    'use server'
    const id = formData.get('id') as string
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) throw new Error('not authenticated')
    await sb.from('alertas').update({ lido: true, lido_em: new Date().toISOString(), lido_por: user.id }).eq('id', id)
    revalidatePath('/alertas')
  }

  async function marcarTodosLidos() {
    'use server'
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) throw new Error('not authenticated')
    await sb.from('alertas').update({ lido: true, lido_em: new Date().toISOString(), lido_por: user.id }).eq('lido', false)
    revalidatePath('/alertas')
  }

  const naoLidos = (alertas ?? []).filter((a) => !a.lido).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Alertas</h1>
          <p className="text-sm text-neutral-500">{naoLidos} não lido(s)</p>
        </div>
        {naoLidos > 0 && (
          <form action={marcarTodosLidos}>
            <Button variant="outline" type="submit">Marcar tudo como lido</Button>
          </form>
        )}
      </div>

      {(alertas ?? []).length === 0 ? (
        <p className="text-neutral-500">Sem alertas.</p>
      ) : (
        <div className="space-y-3">
          {alertas!.map((a) => (
            <div key={a.id} className={`border rounded-md p-4 ${a.lido ? 'bg-neutral-50' : 'bg-white border-neutral-300'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={SEV_VARIANT[a.severidade as string]}>{a.severidade}</Badge>
                    <span className="text-xs text-neutral-500">{a.tipo} · {new Date(a.criado_em).toLocaleString('pt-BR')}</span>
                  </div>
                  <h3 className="font-medium">{a.titulo}</h3>
                  <p className="text-sm text-neutral-600 mt-1">{a.mensagem}</p>
                </div>
                {!a.lido && (
                  <form action={marcarLido}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button size="sm" variant="ghost" type="submit">Marcar lido</Button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2:** Sidebar bell — for v1, simplest is to show the count in the existing sidebar nav item for "Alertas". Add this to the sidebar:

In `src/components/sidebar.tsx`, add a separate prop for unread count. Or simpler: make a `<AlertasNavItem>` server component that fetches the count and renders the link with badge. Inline into sidebar.

The sidebar is currently a client component. Modify so it accepts `alertasUnread: number` prop:

```tsx
// in NAV array, change the Alertas entry to include a badge:
{ href: '/alertas', label: 'Alertas' }   // baseline
// in the render loop, if href === '/alertas', show the count as a small badge
```

Update `src/app/(dashboard)/layout.tsx` to fetch unread count server-side and pass to Sidebar:

```tsx
import { Sidebar } from '@/components/sidebar'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { count: alertasUnread } = await supabase
    .from('alertas').select('id', { count: 'exact', head: true }).eq('lido', false)

  return (
    <div className="flex min-h-screen">
      <Sidebar alertasUnread={alertasUnread ?? 0} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
```

And in Sidebar component, accept `alertasUnread` prop and render small badge next to "Alertas" link.

Note: the sidebar currently doesn't list "Alertas" in its NAV array. Add it after "Forecast":
```ts
{ href: '/alertas', label: 'Alertas' },
```

Build + commit:
```bash
npm run build
git add -A
git commit -m "feat(ui): alertas inbox with mark-as-read + sidebar unread badge"
```

---

### Task 14: Integration tests

**Files:**
- `tests/integration/forecast-recompute.test.ts` — driver change recomputes projecoes
- `tests/integration/alertas-evaluator.test.ts` — eval produces expected alertas

```ts
// tests/integration/forecast-recompute.test.ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { gerarForecast } from '@/modules/forecast/engine'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient('http://127.0.0.1:54321', SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('forecast recompute', () => {
  it('writes 12 projections per cenario when recomputarProjecoes runs', async () => {
    const db = admin()

    // Seed contas and a contract so snapshot is non-zero
    await db.from('contas_bancarias').insert({ banco: `Test-${Date.now()}`, tipo: 'cc', saldo_atual: 50000 })

    const { recomputarProjecoes } = await import('@/modules/forecast/cenarios')
    const result = await recomputarProjecoes(undefined, 12)
    expect(result.recomputed).toBeGreaterThanOrEqual(3)  // Base, Best, Worst

    const { data: projecoes } = await db.from('forecast_projecoes').select('cenario_id, mes_ref')
    const byCenario = new Map<string, number>()
    for (const p of projecoes ?? []) {
      byCenario.set(p.cenario_id, (byCenario.get(p.cenario_id) ?? 0) + 1)
    }
    for (const [, count] of byCenario) {
      expect(count).toBe(12)
    }
  })
})

// tests/integration/alertas-evaluator.test.ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.RESEND_MODE = 'mock'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient('http://127.0.0.1:54321', SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('alertas evaluator', () => {
  it('avaliarTodos inserts alertas for known conditions (overdue AP)', async () => {
    const db = admin()

    // Create overdue AP
    const { data: fornecedor } = await db.from('fornecedores')
      .insert({ nome: `For-${Date.now()}` }).select().single()
    await db.from('contas_a_pagar').insert({
      tipo_credor: 'fornecedor',
      credor_id: fornecedor!.id,
      origem: 'avulso',
      descricao: 'Old bill',
      valor: 500,
      data_vencimento: '2026-01-01',   // way overdue
      status: 'previsto',
    })

    // Clear existing alertas to avoid dedup
    await db.from('alertas').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    const { avaliarTodos } = await import('@/modules/alertas/evaluator')
    const stats = await avaliarTodos('2026-05-15')
    expect(stats.notified).toBeGreaterThan(0)

    const { data: alertas } = await db.from('alertas')
      .select('tipo').eq('tipo', 'ap_atrasada')
    expect(alertas?.length ?? 0).toBeGreaterThan(0)
  })
})
```

Run:
```bash
export SUPABASE_SERVICE_ROLE_KEY=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY=" .env.local | cut -d= -f2-)
npm run test:int
```

Expected: 12 integration tests pass total.

Commit: `test(integration): forecast recompute + alertas evaluator`

---

### Task 15: Final verification

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
npm run test:int
npm run test:e2e
npm run build
```

Update README: `| 5 ✅ | Forecast + Alertas |`. Commit: `docs: mark Phase 5 complete in roadmap`.

---

## Acceptance Criteria

- [ ] All lint/typecheck/test tiers green
- [ ] Migrations 0024-0026 apply cleanly
- [ ] Forecast engine TDD passes (7 tests on math)
- [ ] Alert rules TDD passes (12 tests on 6 rule evaluators)
- [ ] `/forecast` shows 3 cenario cards, recharts line chart, editable drivers per cenario; saving recomputes projecoes
- [ ] `/alertas` lists alertas with severity badge + mark-as-read action
- [ ] Sidebar shows unread count badge
- [ ] Cron `/api/cron/avaliar-alertas` produces alertas + sends email (mock)
- [ ] Dedup: same alerta tipo within 24h is skipped
