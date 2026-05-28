# Fase 1 — Receitas + Contas a Receber Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the revenue side of the system — track clients, recurring AaaS contracts, project work with milestones, and the accounts receivable pipeline that feeds cash flow. After this phase, the founder can model "who owes us money, for what, and when" with MRR/ARR/churn metrics computed from real data.

**Architecture:** Five new migrations (clientes, contratos, projetos, milestones, contas_a_receber). Business logic lives in `src/modules/receitas/` and `src/modules/contas-receber/`. AR generation runs as scheduled jobs (`supabase/functions/` Edge Functions called by pg_cron) — daily check for upcoming contract billings + monthly batch. UI under `src/app/(dashboard)/receitas/` and `src/app/(dashboard)/contas-receber/`. RLS via existing role helpers from Phase 0. Audit via `withAudit` for sensitive mutations (mark received, cancel AR).

**Tech Stack:** Same as Phase 0 (Next.js 16, Supabase, Tailwind/shadcn, Vitest, Playwright). New shadcn primitives needed: `dialog`, `select`, `table`, `dropdown-menu`, `badge`, `form`.

**Out of scope** (deferred to Phase 1.5 or later, do NOT implement here):
- NF-e emission via eNotas (Phase 1.5)
- Email cobrança via Resend (Phase 1.5)
- LLM contract extraction from PDF (uses `prompts/contratos/SKILL.md`, Phase 4)
- Multi-currency conversion display (BRL only this phase)

**Working directory:** all relative paths from `c:/Users/rgoal/Desktop/IAgentics/Gestao IAgentics/`. Quote it in shell commands.

**Prerequisites:** Phase 0 complete on `master`. Supabase local running. Tests passing.

---

## File Structure

Files this phase creates:

| Path | Responsibility |
|---|---|
| `supabase/migrations/0006_clientes.sql` | Cliente table + RLS |
| `supabase/migrations/0007_contratos.sql` | Contratos AaaS recorrentes + RLS |
| `supabase/migrations/0008_projetos.sql` | Projetos table + RLS |
| `supabase/migrations/0009_milestones.sql` | Milestones per projeto + RLS |
| `supabase/migrations/0010_contas_a_receber.sql` | AR pipeline + RLS + triggers |
| `src/lib/schemas/cliente.ts` | Zod schemas (Cliente, NewCliente) |
| `src/lib/schemas/contrato.ts` | Zod schemas (Contrato, NewContrato) |
| `src/lib/schemas/projeto.ts` | Zod schemas (Projeto, Milestone) |
| `src/lib/schemas/ar.ts` | Zod schemas (ContaAReceber) |
| `src/modules/receitas/clientes.ts` | Client service (CRUD) |
| `src/modules/receitas/contratos.ts` | Contract service (CRUD + status transitions) |
| `src/modules/receitas/projetos.ts` | Project + milestones service |
| `src/modules/receitas/metricas.ts` | MRR / ARR / churn / NRR calculations (pure functions) |
| `src/modules/contas-receber/ar.ts` | AR pipeline service (list, mark received, cancel) |
| `src/modules/contas-receber/gerador.ts` | Job: generate monthly AR from active contratos |
| `src/app/(dashboard)/receitas/page.tsx` | Receitas overview with MRR/ARR cards |
| `src/app/(dashboard)/receitas/clientes/page.tsx` | Clientes list |
| `src/app/(dashboard)/receitas/clientes/[id]/page.tsx` | Cliente detail |
| `src/app/(dashboard)/receitas/contratos/page.tsx` | Contratos list |
| `src/app/(dashboard)/receitas/contratos/[id]/page.tsx` | Contrato detail (com milestones if attached) |
| `src/app/(dashboard)/receitas/projetos/page.tsx` | Projetos list |
| `src/app/(dashboard)/receitas/projetos/[id]/page.tsx` | Projeto detail (milestones inline) |
| `src/app/(dashboard)/contas-receber/page.tsx` | AR pipeline view |
| `src/app/api/cron/gerar-ar/route.ts` | HTTP-callable job endpoint (auth via cron secret) |
| `src/components/forms/cliente-form.tsx` | Reusable cliente create/edit form |
| `src/components/forms/contrato-form.tsx` | Reusable contrato form |
| `src/components/forms/projeto-form.tsx` | Reusable projeto form |
| `src/components/ar-table.tsx` | AR pipeline table widget |
| `tests/unit/modules/receitas/metricas.test.ts` | MRR/ARR/churn tests |
| `tests/unit/modules/contas-receber/gerador.test.ts` | AR generation logic tests |
| `tests/integration/contrato-gera-ar.test.ts` | Full pipeline: contrato → AR → recebido → lancamento |
| `tests/e2e/criar-cliente.spec.ts` | E2E: create client + contract + see in AR pipeline |

Files this phase does NOT create (future phases):
- `lancamentos` table — Phase 2 (Despesas)
- `fornecedores`, `despesas_recorrentes`, `contas_a_pagar` — Phase 2
- Folha tables — Phase 3
- Pluggy integration — Phase 4
- eNotas integration — Phase 1.5 (separate plan)

---

## Tasks

### Task 1: Migration 0006 — clientes

**Files:**
- Create: `supabase/migrations/0006_clientes.sql`

- [ ] **Step 1: Create migration file**

```bash
supabase migration new clientes
mv supabase/migrations/*_clientes.sql supabase/migrations/0006_clientes.sql
```

- [ ] **Step 2: Write migration**

Replace `supabase/migrations/0006_clientes.sql`:

```sql
create type cliente_status as enum ('ativo', 'inativo', 'churned');

create table public.clientes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  cnpj          text,
  segmento      text,
  status        cliente_status not null default 'ativo',
  moeda_padrao  text not null default 'BRL',
  contato_email text,
  contato_telefone text,
  observacoes   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index clientes_status on public.clientes (status) where status = 'ativo';
create index clientes_cnpj on public.clientes (cnpj) where cnpj is not null;

create trigger clientes_atualizado_em
  before update on public.clientes
  for each row execute function public.tg_set_atualizado_em();

alter table public.clientes enable row level security;

create policy "clientes_select_authenticated"
  on public.clientes for select to authenticated using (true);

create policy "clientes_modify_can_write"
  on public.clientes for all to authenticated
  using (public.can_write()) with check (public.can_write());
```

- [ ] **Step 3: Apply**

```bash
supabase db reset
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_clientes.sql
git commit -m "feat(db): add clientes table"
```

---

### Task 2: Migration 0007 — contratos (AaaS recorrente)

**Files:**
- Create: `supabase/migrations/0007_contratos.sql`

- [ ] **Step 1: Create**

```bash
supabase migration new contratos
mv supabase/migrations/*_contratos.sql supabase/migrations/0007_contratos.sql
```

- [ ] **Step 2: Write**

```sql
create type contrato_tipo as enum ('mensal', 'anual');
create type contrato_status as enum ('ativo', 'pausado', 'churned');

create table public.contratos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id) on delete restrict,
  nome            text not null,
  tipo            contrato_tipo not null default 'mensal',
  ticket          numeric(14,2) not null check (ticket >= 0),
  moeda           text not null default 'BRL',
  dia_cobranca    int not null default 1 check (dia_cobranca between 1 and 28),
  data_inicio     date not null,
  data_fim        date,
  status          contrato_status not null default 'ativo',
  motivo_churn    text,
  data_churn      date,
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint contrato_fim_apos_inicio check (data_fim is null or data_fim >= data_inicio),
  constraint churn_tem_data check (
    (status <> 'churned') or (data_churn is not null)
  )
);

create index contratos_cliente on public.contratos (cliente_id);
create index contratos_status_ativo on public.contratos (status) where status = 'ativo';
create index contratos_dia_cobranca on public.contratos (dia_cobranca) where status = 'ativo';

create trigger contratos_atualizado_em
  before update on public.contratos
  for each row execute function public.tg_set_atualizado_em();

alter table public.contratos enable row level security;

create policy "contratos_select_authenticated"
  on public.contratos for select to authenticated using (true);

create policy "contratos_modify_can_write"
  on public.contratos for all to authenticated
  using (public.can_write()) with check (public.can_write());
```

- [ ] **Step 3:** `supabase db reset` — expect clean.

- [ ] **Step 4:** Commit:
```bash
git add supabase/migrations/0007_contratos.sql
git commit -m "feat(db): add contratos table (AaaS recurring)"
```

---

### Task 3: Migration 0008 — projetos

**Files:**
- Create: `supabase/migrations/0008_projetos.sql`

- [ ] **Step 1:**
```bash
supabase migration new projetos
mv supabase/migrations/*_projetos.sql supabase/migrations/0008_projetos.sql
```

- [ ] **Step 2:** Write:

```sql
create type projeto_status as enum ('proposta', 'ativo', 'pausado', 'concluido', 'cancelado');

create table public.projetos (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references public.clientes(id) on delete restrict,
  nome                 text not null,
  descricao            text,
  valor_total          numeric(14,2) not null check (valor_total >= 0),
  moeda                text not null default 'BRL',
  data_inicio          date not null,
  data_prevista_fim    date not null,
  data_real_fim        date,
  status               projeto_status not null default 'proposta',
  observacoes          text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint projeto_fim_apos_inicio check (data_prevista_fim >= data_inicio)
);

create index projetos_cliente on public.projetos (cliente_id);
create index projetos_status on public.projetos (status);

create trigger projetos_atualizado_em
  before update on public.projetos
  for each row execute function public.tg_set_atualizado_em();

alter table public.projetos enable row level security;

create policy "projetos_select_authenticated"
  on public.projetos for select to authenticated using (true);

create policy "projetos_modify_can_write"
  on public.projetos for all to authenticated
  using (public.can_write()) with check (public.can_write());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit:
```bash
git add supabase/migrations/0008_projetos.sql
git commit -m "feat(db): add projetos table"
```

---

### Task 4: Migration 0009 — milestones

**Files:**
- Create: `supabase/migrations/0009_milestones.sql`

- [ ] **Step 1:**
```bash
supabase migration new milestones
mv supabase/migrations/*_milestones.sql supabase/migrations/0009_milestones.sql
```

- [ ] **Step 2:**

```sql
create type milestone_status as enum ('pendente', 'em_andamento', 'concluido', 'faturado', 'pago');

create table public.milestones (
  id              uuid primary key default gen_random_uuid(),
  projeto_id      uuid not null references public.projetos(id) on delete cascade,
  ordem           int not null,
  descricao       text not null,
  valor           numeric(14,2) not null check (valor >= 0),
  data_prevista   date not null,
  data_real       date,
  status          milestone_status not null default 'pendente',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (projeto_id, ordem)
);

create index milestones_projeto on public.milestones (projeto_id);
create index milestones_status_pendente on public.milestones (status) where status in ('pendente', 'em_andamento');

create trigger milestones_atualizado_em
  before update on public.milestones
  for each row execute function public.tg_set_atualizado_em();

-- invariant check via trigger: sum of milestones cannot exceed projeto.valor_total
-- (we allow under — partial milestones cover partial project budget)
create or replace function public.check_milestone_total()
returns trigger language plpgsql as $$
declare
  total numeric(14,2);
  projeto_total numeric(14,2);
begin
  select coalesce(sum(valor), 0) into total
  from public.milestones
  where projeto_id = new.projeto_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  total := total + new.valor;

  select valor_total into projeto_total from public.projetos where id = new.projeto_id;

  if total > projeto_total then
    raise exception 'soma de milestones (% ) excede valor do projeto (%)', total, projeto_total;
  end if;

  return new;
end $$;

create trigger milestones_check_total
  before insert or update of valor, projeto_id on public.milestones
  for each row execute function public.check_milestone_total();

alter table public.milestones enable row level security;

create policy "milestones_select_authenticated"
  on public.milestones for select to authenticated using (true);

create policy "milestones_modify_can_write"
  on public.milestones for all to authenticated
  using (public.can_write()) with check (public.can_write());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit:
```bash
git add supabase/migrations/0009_milestones.sql
git commit -m "feat(db): add milestones table with sum invariant check"
```

---

### Task 5: Migration 0010 — contas_a_receber (AR)

**Files:**
- Create: `supabase/migrations/0010_contas_a_receber.sql`

- [ ] **Step 1:**
```bash
supabase migration new contas_a_receber
mv supabase/migrations/*_contas_a_receber.sql supabase/migrations/0010_contas_a_receber.sql
```

- [ ] **Step 2:**

```sql
create type ar_origem as enum ('contrato', 'milestone', 'avulso');
create type ar_status as enum ('previsto', 'emitido', 'recebido', 'atrasado', 'cancelado');

create table public.contas_a_receber (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id) on delete restrict,
  origem          ar_origem not null,
  origem_id       uuid,                                   -- contrato_id or milestone_id, null for avulso
  valor           numeric(14,2) not null check (valor > 0),
  moeda           text not null default 'BRL',
  data_emissao    date not null,
  data_vencimento date not null,
  status          ar_status not null default 'previsto',
  data_recebimento date,
  lancamento_id   uuid,                                   -- forward-decl; FK added in Phase 2
  nf_externa_id   text,
  nf_url          text,
  observacoes     text,
  anexo_path      text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint ar_vencimento_apos_emissao check (data_vencimento >= data_emissao),
  constraint ar_recebido_requer_data check (
    (status <> 'recebido') or (data_recebimento is not null)
  ),
  constraint ar_origem_id_when_not_avulso check (
    (origem = 'avulso') or (origem_id is not null)
  )
);

create index ar_cliente on public.contas_a_receber (cliente_id);
create index ar_status_aberto on public.contas_a_receber (status, data_vencimento)
  where status in ('previsto', 'emitido', 'atrasado');
create index ar_origem_lookup on public.contas_a_receber (origem, origem_id);
-- prevent generating the same contrato AR twice for the same month
create unique index ar_contrato_mes_unique
  on public.contas_a_receber (origem_id, date_trunc('month', data_emissao))
  where origem = 'contrato';
-- prevent generating the same milestone AR twice
create unique index ar_milestone_unique
  on public.contas_a_receber (origem_id)
  where origem = 'milestone';

create trigger contas_a_receber_atualizado_em
  before update on public.contas_a_receber
  for each row execute function public.tg_set_atualizado_em();

alter table public.contas_a_receber enable row level security;

create policy "ar_select_authenticated"
  on public.contas_a_receber for select to authenticated using (true);

create policy "ar_modify_can_write"
  on public.contas_a_receber for all to authenticated
  using (public.can_write()) with check (public.can_write());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit:
```bash
git add supabase/migrations/0010_contas_a_receber.sql
git commit -m "feat(db): add contas_a_receber with origem invariants + dedup indexes"
```

---

### Task 6: Zod schemas for receitas + AR

**Files:**
- Create: `src/lib/schemas/cliente.ts`, `src/lib/schemas/contrato.ts`, `src/lib/schemas/projeto.ts`, `src/lib/schemas/ar.ts`
- Test: `tests/unit/schemas/receitas.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/schemas/receitas.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { NewCliente } from '@/lib/schemas/cliente'
import { NewContrato } from '@/lib/schemas/contrato'
import { NewProjeto, NewMilestone } from '@/lib/schemas/projeto'
import { NewContaAReceber } from '@/lib/schemas/ar'

describe('NewCliente', () => {
  it('requires nome', () => {
    expect(NewCliente.safeParse({}).success).toBe(false)
  })
  it('accepts minimal cliente', () => {
    expect(NewCliente.safeParse({ nome: 'Acme' }).success).toBe(true)
  })
  it('accepts full cliente', () => {
    expect(NewCliente.safeParse({
      nome: 'Acme', cnpj: '12345678000190', segmento: 'tech',
      contato_email: 'a@b.com', moeda_padrao: 'BRL',
    }).success).toBe(true)
  })
  it('rejects invalid email', () => {
    expect(NewCliente.safeParse({ nome: 'Acme', contato_email: 'notanemail' }).success).toBe(false)
  })
})

describe('NewContrato', () => {
  const valid = {
    cliente_id: '550e8400-e29b-41d4-a716-446655440000',
    nome: 'AaaS Pro',
    tipo: 'mensal' as const,
    ticket: 500,
    dia_cobranca: 10,
    data_inicio: '2026-05-01',
  }
  it('accepts valid contrato', () => {
    expect(NewContrato.safeParse(valid).success).toBe(true)
  })
  it('rejects negative ticket', () => {
    expect(NewContrato.safeParse({ ...valid, ticket: -1 }).success).toBe(false)
  })
  it('rejects dia_cobranca > 28', () => {
    expect(NewContrato.safeParse({ ...valid, dia_cobranca: 31 }).success).toBe(false)
  })
})

describe('NewProjeto', () => {
  const valid = {
    cliente_id: '550e8400-e29b-41d4-a716-446655440000',
    nome: 'Implementação',
    valor_total: 50000,
    data_inicio: '2026-05-01',
    data_prevista_fim: '2026-08-01',
  }
  it('accepts valid projeto', () => {
    expect(NewProjeto.safeParse(valid).success).toBe(true)
  })
  it('rejects fim_before_inicio', () => {
    expect(NewProjeto.safeParse({ ...valid, data_prevista_fim: '2026-04-01' }).success).toBe(false)
  })
})

describe('NewMilestone', () => {
  it('accepts valid milestone', () => {
    expect(NewMilestone.safeParse({
      projeto_id: '550e8400-e29b-41d4-a716-446655440000',
      ordem: 1, descricao: 'Setup', valor: 10000,
      data_prevista: '2026-05-15',
    }).success).toBe(true)
  })
  it('rejects ordem < 1', () => {
    expect(NewMilestone.safeParse({
      projeto_id: '550e8400-e29b-41d4-a716-446655440000',
      ordem: 0, descricao: 'X', valor: 100, data_prevista: '2026-05-15',
    }).success).toBe(false)
  })
})

describe('NewContaAReceber', () => {
  const valid = {
    cliente_id: '550e8400-e29b-41d4-a716-446655440000',
    origem: 'avulso' as const,
    valor: 1000,
    data_emissao: '2026-05-01',
    data_vencimento: '2026-05-15',
  }
  it('accepts valid avulso AR', () => {
    expect(NewContaAReceber.safeParse(valid).success).toBe(true)
  })
  it('requires origem_id when not avulso', () => {
    expect(NewContaAReceber.safeParse({ ...valid, origem: 'contrato' }).success).toBe(false)
  })
  it('rejects vencimento before emissao', () => {
    expect(NewContaAReceber.safeParse({ ...valid, data_vencimento: '2026-04-01' }).success).toBe(false)
  })
})
```

Run — expect FAIL (modules don't exist).
```bash
npm test -- tests/unit/schemas/receitas.test.ts
```

- [ ] **Step 2: Implement schemas**

Create `src/lib/schemas/cliente.ts`:
```ts
import { z } from 'zod'
import { Uuid, Moeda, Cnpj } from './common'

export const ClienteStatus = z.enum(['ativo', 'inativo', 'churned'])

export const NewCliente = z.object({
  nome: z.string().min(1),
  cnpj: Cnpj.optional(),
  segmento: z.string().optional(),
  status: ClienteStatus.default('ativo'),
  moeda_padrao: Moeda,
  contato_email: z.string().email().optional(),
  contato_telefone: z.string().optional(),
  observacoes: z.string().optional(),
})

export const Cliente = NewCliente.extend({
  id: Uuid,
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewCliente = z.infer<typeof NewCliente>
export type Cliente = z.infer<typeof Cliente>
```

Create `src/lib/schemas/contrato.ts`:
```ts
import { z } from 'zod'
import { Uuid, Money, Moeda } from './common'

export const ContratoTipo = z.enum(['mensal', 'anual'])
export const ContratoStatus = z.enum(['ativo', 'pausado', 'churned'])

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewContrato = z.object({
  cliente_id: Uuid,
  nome: z.string().min(1),
  tipo: ContratoTipo.default('mensal'),
  ticket: Money,
  moeda: Moeda,
  dia_cobranca: z.number().int().min(1).max(28),
  data_inicio: DateStr,
  data_fim: DateStr.optional(),
  status: ContratoStatus.default('ativo'),
  observacoes: z.string().optional(),
}).refine(
  (v) => !v.data_fim || v.data_fim >= v.data_inicio,
  { message: 'data_fim must be on or after data_inicio', path: ['data_fim'] },
)

export const Contrato = z.object({
  id: Uuid,
  cliente_id: Uuid,
  nome: z.string(),
  tipo: ContratoTipo,
  ticket: Money,
  moeda: z.string(),
  dia_cobranca: z.number().int(),
  data_inicio: DateStr,
  data_fim: DateStr.nullable(),
  status: ContratoStatus,
  motivo_churn: z.string().nullable(),
  data_churn: DateStr.nullable(),
  observacoes: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewContrato = z.infer<typeof NewContrato>
export type Contrato = z.infer<typeof Contrato>
```

Create `src/lib/schemas/projeto.ts`:
```ts
import { z } from 'zod'
import { Uuid, Money, Moeda } from './common'

export const ProjetoStatus = z.enum(['proposta', 'ativo', 'pausado', 'concluido', 'cancelado'])
export const MilestoneStatus = z.enum(['pendente', 'em_andamento', 'concluido', 'faturado', 'pago'])

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewProjeto = z.object({
  cliente_id: Uuid,
  nome: z.string().min(1),
  descricao: z.string().optional(),
  valor_total: Money,
  moeda: Moeda,
  data_inicio: DateStr,
  data_prevista_fim: DateStr,
  status: ProjetoStatus.default('proposta'),
  observacoes: z.string().optional(),
}).refine(
  (v) => v.data_prevista_fim >= v.data_inicio,
  { message: 'data_prevista_fim must be on or after data_inicio', path: ['data_prevista_fim'] },
)

export const NewMilestone = z.object({
  projeto_id: Uuid,
  ordem: z.number().int().min(1),
  descricao: z.string().min(1),
  valor: Money,
  data_prevista: DateStr,
  status: MilestoneStatus.default('pendente'),
})

export const Projeto = NewProjeto.extend({
  id: Uuid,
  data_real_fim: DateStr.nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export const Milestone = NewMilestone.extend({
  id: Uuid,
  data_real: DateStr.nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewProjeto = z.infer<typeof NewProjeto>
export type Projeto = z.infer<typeof Projeto>
export type NewMilestone = z.infer<typeof NewMilestone>
export type Milestone = z.infer<typeof Milestone>
```

Create `src/lib/schemas/ar.ts`:
```ts
import { z } from 'zod'
import { Uuid, Money, Moeda } from './common'

export const AROrigem = z.enum(['contrato', 'milestone', 'avulso'])
export const ARStatus = z.enum(['previsto', 'emitido', 'recebido', 'atrasado', 'cancelado'])

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewContaAReceber = z.object({
  cliente_id: Uuid,
  origem: AROrigem,
  origem_id: Uuid.optional(),
  valor: Money.refine((v) => v > 0, 'valor must be > 0'),
  moeda: Moeda,
  data_emissao: DateStr,
  data_vencimento: DateStr,
  status: ARStatus.default('previsto'),
  observacoes: z.string().optional(),
})
  .refine(
    (v) => v.origem === 'avulso' || !!v.origem_id,
    { message: 'origem_id required for non-avulso origem', path: ['origem_id'] },
  )
  .refine(
    (v) => v.data_vencimento >= v.data_emissao,
    { message: 'data_vencimento must be on or after data_emissao', path: ['data_vencimento'] },
  )

export const ContaAReceber = z.object({
  id: Uuid,
  cliente_id: Uuid,
  origem: AROrigem,
  origem_id: Uuid.nullable(),
  valor: Money,
  moeda: z.string(),
  data_emissao: DateStr,
  data_vencimento: DateStr,
  status: ARStatus,
  data_recebimento: DateStr.nullable(),
  lancamento_id: Uuid.nullable(),
  nf_externa_id: z.string().nullable(),
  nf_url: z.string().nullable(),
  observacoes: z.string().nullable(),
  anexo_path: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewContaAReceber = z.infer<typeof NewContaAReceber>
export type ContaAReceber = z.infer<typeof ContaAReceber>
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/unit/schemas/receitas.test.ts
```
Expected: 13 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schemas tests/unit/schemas/receitas.test.ts
git commit -m "feat(schemas): zod schemas for cliente, contrato, projeto, milestone, AR"
```

---

### Task 7: Metricas service (MRR / ARR / churn) — TDD

**Files:**
- Create: `src/modules/receitas/metricas.ts`
- Test: `tests/unit/modules/receitas/metricas.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/modules/receitas/metricas.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { calcularMRR, calcularARR, calcularChurnRate, calcularNRR } from '@/modules/receitas/metricas'
import type { Contrato } from '@/lib/schemas/contrato'

function contrato(p: Partial<Contrato>): Contrato {
  return {
    id: crypto.randomUUID(),
    cliente_id: crypto.randomUUID(),
    nome: 'Test',
    tipo: 'mensal',
    ticket: 1000,
    moeda: 'BRL',
    dia_cobranca: 1,
    data_inicio: '2026-01-01',
    data_fim: null,
    status: 'ativo',
    motivo_churn: null,
    data_churn: null,
    observacoes: null,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...p,
  }
}

describe('calcularMRR', () => {
  it('returns 0 when no contracts', () => {
    expect(calcularMRR([], '2026-05-01')).toBe(0)
  })

  it('sums monthly ticket of active contracts', () => {
    const result = calcularMRR(
      [contrato({ tipo: 'mensal', ticket: 1000 }), contrato({ tipo: 'mensal', ticket: 500 })],
      '2026-05-01',
    )
    expect(result).toBe(1500)
  })

  it('divides annual ticket by 12', () => {
    expect(calcularMRR([contrato({ tipo: 'anual', ticket: 12000 })], '2026-05-01')).toBe(1000)
  })

  it('excludes contracts that started after reference date', () => {
    expect(calcularMRR([contrato({ data_inicio: '2026-06-01' })], '2026-05-01')).toBe(0)
  })

  it('excludes contracts that ended before reference date', () => {
    expect(calcularMRR(
      [contrato({ data_fim: '2026-04-30' })],
      '2026-05-01',
    )).toBe(0)
  })

  it('excludes churned and paused contracts', () => {
    expect(calcularMRR(
      [contrato({ status: 'churned' }), contrato({ status: 'pausado' })],
      '2026-05-01',
    )).toBe(0)
  })
})

describe('calcularARR', () => {
  it('is MRR * 12', () => {
    const c = [contrato({ tipo: 'mensal', ticket: 1000 })]
    expect(calcularARR(c, '2026-05-01')).toBe(12000)
  })
})

describe('calcularChurnRate', () => {
  it('returns 0 when nothing churned', () => {
    expect(calcularChurnRate([], '2026-05-01')).toBe(0)
  })

  it('returns ratio of churned MRR / total MRR start of month', () => {
    const c = [
      contrato({ id: '1', ticket: 1000, status: 'ativo' }),
      contrato({ id: '2', ticket: 500, status: 'churned', data_churn: '2026-05-15', data_fim: '2026-05-15' }),
    ]
    // MRR start of month = 1000 + 500 = 1500
    // churned MRR in month = 500
    // churn rate = 500/1500 = 0.333...
    expect(calcularChurnRate(c, '2026-05-01')).toBeCloseTo(500 / 1500, 5)
  })
})

describe('calcularNRR', () => {
  it('returns 1.0 when no changes (kept all contracts at same ticket)', () => {
    const start = [contrato({ id: '1', ticket: 1000 })]
    const end = [contrato({ id: '1', ticket: 1000 })]
    expect(calcularNRR(start, end)).toBe(1.0)
  })

  it('returns > 1 when existing customers expanded', () => {
    const start = [contrato({ id: '1', cliente_id: 'A', ticket: 1000 })]
    const end = [contrato({ id: '2', cliente_id: 'A', ticket: 1500 })]
    expect(calcularNRR(start, end)).toBe(1.5)
  })

  it('does not include new customers in NRR', () => {
    const start = [contrato({ id: '1', cliente_id: 'A', ticket: 1000 })]
    const end = [
      contrato({ id: '1', cliente_id: 'A', ticket: 1000 }),
      contrato({ id: '2', cliente_id: 'B', ticket: 5000 }),  // new logo
    ]
    expect(calcularNRR(start, end)).toBe(1.0)
  })
})
```

Run — expect FAIL.

- [ ] **Step 2: Implement**

Create `src/modules/receitas/metricas.ts`:
```ts
import type { Contrato } from '@/lib/schemas/contrato'

/**
 * Returns the monthly recurring revenue at a given reference date.
 * Annual contracts contribute ticket/12. Only 'ativo' contracts that span
 * the reference date are included.
 */
export function calcularMRR(contratos: Contrato[], refDate: string): number {
  return contratos
    .filter((c) => isAtivoNaData(c, refDate))
    .reduce((sum, c) => sum + ticketMensal(c), 0)
}

export function calcularARR(contratos: Contrato[], refDate: string): number {
  return calcularMRR(contratos, refDate) * 12
}

/**
 * Churn rate over a month = (MRR of contracts that churned in [refDate, refDate+1mo]) / (MRR at refDate)
 */
export function calcularChurnRate(contratos: Contrato[], refDate: string): number {
  const mrrInicio = calcularMRR(contratos, refDate)
  if (mrrInicio === 0) return 0

  const fimMes = addMonths(refDate, 1)
  const mrrChurned = contratos
    .filter((c) => c.status === 'churned' && c.data_churn && c.data_churn >= refDate && c.data_churn < fimMes)
    .reduce((sum, c) => sum + ticketMensal(c), 0)

  return mrrChurned / mrrInicio
}

/**
 * Net Revenue Retention: comparing existing customers (cliente_id present at start).
 * NRR = MRR(end) of existing customers / MRR(start). New customers excluded.
 */
export function calcularNRR(start: Contrato[], end: Contrato[]): number {
  const startClienteIds = new Set(start.map((c) => c.cliente_id))
  const mrrStart = start.reduce((sum, c) => sum + ticketMensal(c), 0)
  if (mrrStart === 0) return 1.0
  const mrrEndExisting = end
    .filter((c) => startClienteIds.has(c.cliente_id))
    .reduce((sum, c) => sum + ticketMensal(c), 0)
  return mrrEndExisting / mrrStart
}

function ticketMensal(c: Contrato): number {
  return c.tipo === 'anual' ? c.ticket / 12 : c.ticket
}

function isAtivoNaData(c: Contrato, refDate: string): boolean {
  if (c.status !== 'ativo') return false
  if (c.data_inicio > refDate) return false
  if (c.data_fim && c.data_fim < refDate) return false
  return true
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + months, d))
  return date.toISOString().slice(0, 10)
}
```

- [ ] **Step 3: Run tests**
```bash
npm test -- tests/unit/modules/receitas/metricas.test.ts
```
Expected: 12 tests pass.

- [ ] **Step 4: Commit**
```bash
git add src/modules/receitas tests/unit/modules/receitas
git commit -m "feat(modules): MRR/ARR/churn/NRR calculations with TDD"
```

---

### Task 8: AR generator service — TDD

**Files:**
- Create: `src/modules/contas-receber/gerador.ts`
- Test: `tests/unit/modules/contas-receber/gerador.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/modules/contas-receber/gerador.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { gerarARDoContrato, gerarARDoMilestone } from '@/modules/contas-receber/gerador'
import type { Contrato } from '@/lib/schemas/contrato'
import type { Milestone } from '@/lib/schemas/projeto'

const contratoBase: Contrato = {
  id: '11111111-1111-1111-1111-111111111111',
  cliente_id: '22222222-2222-2222-2222-222222222222',
  nome: 'AaaS Pro',
  tipo: 'mensal',
  ticket: 1000,
  moeda: 'BRL',
  dia_cobranca: 10,
  data_inicio: '2026-05-01',
  data_fim: null,
  status: 'ativo',
  motivo_churn: null,
  data_churn: null,
  observacoes: null,
  criado_em: '2026-05-01T00:00:00Z',
  atualizado_em: '2026-05-01T00:00:00Z',
}

describe('gerarARDoContrato', () => {
  it('generates AR for active monthly contract on its billing day', () => {
    const ar = gerarARDoContrato(contratoBase, '2026-05-01')
    expect(ar).not.toBeNull()
    expect(ar!.cliente_id).toBe(contratoBase.cliente_id)
    expect(ar!.origem).toBe('contrato')
    expect(ar!.origem_id).toBe(contratoBase.id)
    expect(ar!.valor).toBe(1000)
    expect(ar!.data_emissao).toBe('2026-05-01')
    expect(ar!.data_vencimento).toBe('2026-05-10')  // dia_cobranca within emission month
  })

  it('returns null for paused contracts', () => {
    expect(gerarARDoContrato({ ...contratoBase, status: 'pausado' }, '2026-05-01')).toBeNull()
  })

  it('returns null when contract starts after the month', () => {
    expect(gerarARDoContrato({ ...contratoBase, data_inicio: '2026-06-01' }, '2026-05-01')).toBeNull()
  })

  it('returns null when contract ended before the month', () => {
    expect(gerarARDoContrato({ ...contratoBase, data_fim: '2026-04-15' }, '2026-05-01')).toBeNull()
  })

  it('handles annual contract with ticket /12 monthly', () => {
    const annual = { ...contratoBase, tipo: 'anual' as const, ticket: 12000 }
    const ar = gerarARDoContrato(annual, '2026-05-01')
    expect(ar!.valor).toBe(1000)
  })
})

describe('gerarARDoMilestone', () => {
  const milestone: Milestone = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    projeto_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    ordem: 1,
    descricao: 'Setup',
    valor: 5000,
    data_prevista: '2026-05-15',
    data_real: null,
    status: 'concluido',
    criado_em: '2026-05-01T00:00:00Z',
    atualizado_em: '2026-05-01T00:00:00Z',
  }

  it('generates AR for a concluido milestone', () => {
    const ar = gerarARDoMilestone(milestone, milestone.projeto_id, 'cliente-xxx')
    expect(ar).not.toBeNull()
    expect(ar!.origem).toBe('milestone')
    expect(ar!.origem_id).toBe(milestone.id)
    expect(ar!.valor).toBe(5000)
    expect(ar!.data_emissao).toBe('2026-05-15')   // uses data_real or data_prevista
  })

  it('returns null for non-concluido milestones', () => {
    expect(gerarARDoMilestone({ ...milestone, status: 'pendente' }, 'p', 'c')).toBeNull()
    expect(gerarARDoMilestone({ ...milestone, status: 'em_andamento' }, 'p', 'c')).toBeNull()
  })

  it('uses data_real when available', () => {
    const ar = gerarARDoMilestone(
      { ...milestone, data_real: '2026-05-20' },
      milestone.projeto_id, 'cliente-xxx',
    )
    expect(ar!.data_emissao).toBe('2026-05-20')
  })
})
```

Run — expect FAIL.

- [ ] **Step 2: Implement**

Create `src/modules/contas-receber/gerador.ts`:
```ts
import type { NewContaAReceber } from '@/lib/schemas/ar'
import type { Contrato } from '@/lib/schemas/contrato'
import type { Milestone } from '@/lib/schemas/projeto'

/**
 * Generates AR for a contract in a given month, or returns null if the contract
 * shouldn't produce an AR for that month (paused/churned, not yet started, ended).
 *
 * The reference date is the first of the month being billed. Emission is the 1st;
 * due date is dia_cobranca of the same month.
 */
export function gerarARDoContrato(c: Contrato, refMonthStart: string): NewContaAReceber | null {
  if (c.status !== 'ativo') return null
  if (c.data_inicio > refMonthStart) return null
  // Determine the last day of the month
  const monthEnd = lastDayOfMonth(refMonthStart)
  if (c.data_fim && c.data_fim < refMonthStart) return null

  const valor = c.tipo === 'anual' ? c.ticket / 12 : c.ticket
  const dueDate = applyDiaCobranca(refMonthStart, c.dia_cobranca)

  return {
    cliente_id: c.cliente_id,
    origem: 'contrato',
    origem_id: c.id,
    valor,
    moeda: c.moeda,
    data_emissao: refMonthStart,
    data_vencimento: dueDate,
    status: 'previsto',
  }
}

/**
 * Generates AR for a milestone whose status is 'concluido'.
 * Uses data_real if set; otherwise data_prevista.
 */
export function gerarARDoMilestone(
  m: Milestone,
  _projetoId: string,
  clienteId: string,
): NewContaAReceber | null {
  if (m.status !== 'concluido') return null

  const emissao = m.data_real ?? m.data_prevista
  const vencimento = addDays(emissao, 15)  // default Net-15 for milestones

  return {
    cliente_id: clienteId,
    origem: 'milestone',
    origem_id: m.id,
    valor: m.valor,
    moeda: 'BRL',
    data_emissao: emissao,
    data_vencimento: vencimento,
    status: 'previsto',
  }
}

function applyDiaCobranca(monthStart: string, dia: number): string {
  const [y, m] = monthStart.split('-').map(Number)
  return `${y}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function lastDayOfMonth(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}
```

- [ ] **Step 3: Run**
```bash
npm test -- tests/unit/modules/contas-receber
```
Expected: 9 tests pass.

- [ ] **Step 4: Commit**
```bash
git add src/modules/contas-receber tests/unit/modules/contas-receber
git commit -m "feat(modules): AR generator from contracts and milestones with TDD"
```

---

### Task 9: Cliente service (server-side CRUD)

**Files:**
- Create: `src/modules/receitas/clientes.ts`

- [ ] **Step 1: Write service**

Create `src/modules/receitas/clientes.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import { NewCliente, Cliente } from '@/lib/schemas/cliente'
import type { z } from 'zod'

export type ListClientesParams = {
  status?: 'ativo' | 'inativo' | 'churned'
  search?: string
  limit?: number
  offset?: number
}

export async function listarClientes(p: ListClientesParams = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('clientes')
    .select('*', { count: 'exact' })
    .order('nome', { ascending: true })

  if (p.status) q = q.eq('status', p.status)
  if (p.search) q = q.or(`nome.ilike.%${p.search}%,cnpj.ilike.%${p.search}%`)
  if (p.limit) q = q.range(p.offset ?? 0, (p.offset ?? 0) + p.limit - 1)

  const { data, error, count } = await q
  if (error) throw new Error(`listarClientes: ${error.message}`)
  return { data: (data ?? []) as Cliente[], total: count ?? 0 }
}

export async function buscarCliente(id: string): Promise<Cliente | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarCliente: ${error.message}`)
  return data as Cliente | null
}

export async function criarCliente(input: z.input<typeof NewCliente>) {
  const parsed = NewCliente.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('clientes').insert(parsed).select().single()
  if (error) throw new Error(`criarCliente: ${error.message}`)
  return data as Cliente
}

export async function atualizarCliente(id: string, input: Partial<z.input<typeof NewCliente>>) {
  // Partial validation: only validate provided keys via .partial()
  const parsed = NewCliente.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('clientes').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarCliente: ${error.message}`)
  return data as Cliente
}
```

- [ ] **Step 2: Typecheck**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add src/modules/receitas/clientes.ts
git commit -m "feat(modules): cliente service (list, get, create, update)"
```

---

### Task 10: Contrato + Projeto + Milestone services

**Files:**
- Create: `src/modules/receitas/contratos.ts`, `src/modules/receitas/projetos.ts`

- [ ] **Step 1: Contrato service**

Create `src/modules/receitas/contratos.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import { NewContrato, Contrato } from '@/lib/schemas/contrato'
import type { z } from 'zod'

export async function listarContratos(params: { cliente_id?: string; status?: 'ativo'|'pausado'|'churned' } = {}) {
  const supabase = await createClient()
  let q = supabase.from('contratos').select('*').order('criado_em', { ascending: false })
  if (params.cliente_id) q = q.eq('cliente_id', params.cliente_id)
  if (params.status) q = q.eq('status', params.status)
  const { data, error } = await q
  if (error) throw new Error(`listarContratos: ${error.message}`)
  return (data ?? []) as Contrato[]
}

export async function buscarContrato(id: string): Promise<Contrato | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('contratos').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarContrato: ${error.message}`)
  return data as Contrato | null
}

export async function criarContrato(input: z.input<typeof NewContrato>) {
  const parsed = NewContrato.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('contratos').insert(parsed).select().single()
  if (error) throw new Error(`criarContrato: ${error.message}`)
  return data as Contrato
}

export async function atualizarContrato(id: string, input: Partial<z.input<typeof NewContrato>>) {
  const parsed = NewContrato.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('contratos').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarContrato: ${error.message}`)
  return data as Contrato
}

export async function marcarChurn(id: string, motivo: string, data: string) {
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('contratos')
    .update({ status: 'churned', motivo_churn: motivo, data_churn: data, data_fim: data })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`marcarChurn: ${error.message}`)
  return row as Contrato
}
```

- [ ] **Step 2: Projeto + Milestone service**

Create `src/modules/receitas/projetos.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import { NewProjeto, NewMilestone, Projeto, Milestone } from '@/lib/schemas/projeto'
import type { z } from 'zod'

export async function listarProjetos(params: { cliente_id?: string; status?: string } = {}) {
  const supabase = await createClient()
  let q = supabase.from('projetos').select('*').order('criado_em', { ascending: false })
  if (params.cliente_id) q = q.eq('cliente_id', params.cliente_id)
  if (params.status) q = q.eq('status', params.status)
  const { data, error } = await q
  if (error) throw new Error(`listarProjetos: ${error.message}`)
  return (data ?? []) as Projeto[]
}

export async function buscarProjeto(id: string): Promise<Projeto | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('projetos').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarProjeto: ${error.message}`)
  return data as Projeto | null
}

export async function criarProjeto(input: z.input<typeof NewProjeto>) {
  const parsed = NewProjeto.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('projetos').insert(parsed).select().single()
  if (error) throw new Error(`criarProjeto: ${error.message}`)
  return data as Projeto
}

export async function atualizarProjeto(id: string, input: Partial<z.input<typeof NewProjeto>>) {
  const parsed = NewProjeto.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('projetos').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarProjeto: ${error.message}`)
  return data as Projeto
}

export async function listarMilestones(projeto_id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('projeto_id', projeto_id)
    .order('ordem', { ascending: true })
  if (error) throw new Error(`listarMilestones: ${error.message}`)
  return (data ?? []) as Milestone[]
}

export async function criarMilestone(input: z.input<typeof NewMilestone>) {
  const parsed = NewMilestone.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('milestones').insert(parsed).select().single()
  if (error) throw new Error(`criarMilestone: ${error.message}`)
  return data as Milestone
}

export async function atualizarMilestone(id: string, input: Partial<z.input<typeof NewMilestone>>) {
  const parsed = NewMilestone.partial().parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('milestones').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`atualizarMilestone: ${error.message}`)
  return data as Milestone
}
```

- [ ] **Step 3: Typecheck + commit**
```bash
npx tsc --noEmit
git add src/modules/receitas/contratos.ts src/modules/receitas/projetos.ts
git commit -m "feat(modules): contrato + projeto + milestone services"
```

---

### Task 11: AR service (list, mark received, cancel)

**Files:**
- Create: `src/modules/contas-receber/ar.ts`

- [ ] **Step 1: Write service**

Create `src/modules/contas-receber/ar.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NewContaAReceber, ContaAReceber } from '@/lib/schemas/ar'
import { withAudit } from '@/lib/audit'
import type { z } from 'zod'

export type ListARParams = {
  status?: 'previsto' | 'emitido' | 'recebido' | 'atrasado' | 'cancelado'
  cliente_id?: string
  vencimento_ate?: string
  vencimento_de?: string
}

export async function listarAR(p: ListARParams = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('contas_a_receber')
    .select('*, cliente:clientes(nome)')
    .order('data_vencimento', { ascending: true })
  if (p.status) q = q.eq('status', p.status)
  if (p.cliente_id) q = q.eq('cliente_id', p.cliente_id)
  if (p.vencimento_de) q = q.gte('data_vencimento', p.vencimento_de)
  if (p.vencimento_ate) q = q.lte('data_vencimento', p.vencimento_ate)
  const { data, error } = await q
  if (error) throw new Error(`listarAR: ${error.message}`)
  return data ?? []
}

export async function criarAR(input: z.input<typeof NewContaAReceber>) {
  const parsed = NewContaAReceber.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('contas_a_receber').insert(parsed).select().single()
  if (error) throw new Error(`criarAR: ${error.message}`)
  return data as ContaAReceber
}

/**
 * Mark an AR as received. This is a sensitive mutation — wrapped in withAudit.
 * Note: lancamento creation happens in Phase 2 (Despesas/Caixa). For now we just
 * set status='recebido' and data_recebimento. lancamento_id stays null until Phase 4.
 */
export async function marcarRecebido(id: string, dataRecebimento: string, usuarioId: string) {
  const supabase = await createClient()
  const { data: before, error: bErr } = await supabase
    .from('contas_a_receber').select('*').eq('id', id).single()
  if (bErr || !before) throw new Error(`AR not found: ${bErr?.message ?? 'no row'}`)

  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'update',
      tabela: 'contas_a_receber',
      registro_id: id,
      before: before as Record<string, unknown>,
      after: { ...(before as Record<string, unknown>), status: 'recebido', data_recebimento: dataRecebimento },
      motivo: 'marcar como recebido',
    },
    async () => {
      const { data, error } = await supabase
        .from('contas_a_receber')
        .update({ status: 'recebido', data_recebimento: dataRecebimento })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(`marcarRecebido: ${error.message}`)
      return data as ContaAReceber
    },
  )
}

export async function cancelarAR(id: string, motivo: string, usuarioId: string) {
  const supabase = await createClient()
  const { data: before, error: bErr } = await supabase
    .from('contas_a_receber').select('*').eq('id', id).single()
  if (bErr || !before) throw new Error(`AR not found`)

  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'update',
      tabela: 'contas_a_receber',
      registro_id: id,
      before: before as Record<string, unknown>,
      after: { ...(before as Record<string, unknown>), status: 'cancelado' },
      motivo,
    },
    async () => {
      const { data, error } = await supabase
        .from('contas_a_receber').update({ status: 'cancelado' }).eq('id', id).select().single()
      if (error) throw new Error(`cancelarAR: ${error.message}`)
      return data as ContaAReceber
    },
  )
}

/**
 * Service-role helper for the AR generation job. Inserts a batch of NewAR,
 * skipping duplicates (relies on the unique indexes from migration 0010).
 */
export async function inserirARBatch(rows: z.input<typeof NewContaAReceber>[]) {
  if (rows.length === 0) return { inserted: 0, skipped: 0 }
  const parsed = rows.map((r) => NewContaAReceber.parse(r))
  const admin = createServiceClient()
  let inserted = 0
  let skipped = 0
  for (const row of parsed) {
    const { error } = await admin.from('contas_a_receber').insert(row)
    if (error) {
      if (error.code === '23505') {
        skipped++
        continue
      }
      throw new Error(`inserirARBatch: ${error.message}`)
    }
    inserted++
  }
  return { inserted, skipped }
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
npx tsc --noEmit
git add src/modules/contas-receber/ar.ts
git commit -m "feat(modules): AR service (list, create, mark received, cancel) with audit"
```

---

### Task 12: AR generation cron route

**Files:**
- Create: `src/app/api/cron/gerar-ar/route.ts`

- [ ] **Step 1: Write endpoint**

Create `src/app/api/cron/gerar-ar/route.ts`:
```ts
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { gerarARDoContrato } from '@/modules/contas-receber/gerador'
import { inserirARBatch } from '@/modules/contas-receber/ar'
import type { Contrato } from '@/lib/schemas/contrato'

export async function POST(request: NextRequest) {
  // Auth: shared secret in Authorization header
  const expected = process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Determine reference month (param or current month)
  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month')
  const refMonth = monthParam ?? new Date().toISOString().slice(0, 7) + '-01'

  // Fetch all active contracts
  const admin = createServiceClient()
  const { data: contratos, error } = await admin
    .from('contratos')
    .select('*')
    .eq('status', 'ativo')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generate AR for each
  const newARs = (contratos as Contrato[])
    .map((c) => gerarARDoContrato(c, refMonth))
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const result = await inserirARBatch(newARs)
  return NextResponse.json({ refMonth, contratos_ativos: contratos.length, ...result })
}
```

- [ ] **Step 2: Add CRON_SECRET to env templates**

Edit `.env.example`, append (under existing App section):
```
CRON_SECRET=
```

Edit `.env.local` (not committed), append:
```
CRON_SECRET=local-dev-secret-change-me
```

- [ ] **Step 3: Manual smoke test**

Start dev server in background, hit the endpoint with the secret, verify response shape:

```bash
npm run dev &
DEV_PID=$!
sleep 12
curl -s -X POST -H "Authorization: Bearer local-dev-secret-change-me" \
  "http://localhost:3000/api/cron/gerar-ar?month=2026-05-01" | head -200
kill $DEV_PID 2>/dev/null || taskkill /F /PID $DEV_PID 2>/dev/null
```

Expected: JSON like `{"refMonth":"2026-05-01","contratos_ativos":0,"inserted":0,"skipped":0}` (no contracts exist yet, so 0).

- [ ] **Step 4: Commit**
```bash
git add .env.example src/app/api/cron/gerar-ar
git commit -m "feat(api): cron endpoint to generate monthly AR from active contracts"
```

---

### Task 13: Add shadcn primitives needed for forms + tables

```bash
npx shadcn@latest add dialog select table dropdown-menu badge form textarea
```

Verify build:
```bash
npm run build
```

Commit:
```bash
git add -A
git commit -m "chore: install shadcn primitives (dialog, select, table, dropdown-menu, badge, form, textarea)"
```

---

### Task 14: Cliente UI — list + form + detail

**Files:**
- Create: `src/components/forms/cliente-form.tsx`, `src/app/(dashboard)/receitas/clientes/page.tsx`, `src/app/(dashboard)/receitas/clientes/novo/page.tsx`, `src/app/(dashboard)/receitas/clientes/[id]/page.tsx`

- [ ] **Step 1: Reusable form (client component)**

Create `src/components/forms/cliente-form.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type ClienteFormData = {
  nome: string
  cnpj?: string
  segmento?: string
  contato_email?: string
  contato_telefone?: string
  observacoes?: string
}

type Props = {
  initialData?: Partial<ClienteFormData>
  onSubmit: (data: ClienteFormData) => Promise<void>
  submitLabel?: string
}

export function ClienteForm({ initialData, onSubmit, submitLabel = 'Salvar' }: Props) {
  const [data, setData] = useState<ClienteFormData>({
    nome: initialData?.nome ?? '',
    cnpj: initialData?.cnpj ?? '',
    segmento: initialData?.segmento ?? '',
    contato_email: initialData?.contato_email ?? '',
    contato_telefone: initialData?.contato_telefone ?? '',
    observacoes: initialData?.observacoes ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    try {
      await onSubmit(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Cliente</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" required value={data.nome} onChange={(e) => setData({ ...data, nome: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={data.cnpj} onChange={(e) => setData({ ...data, cnpj: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="segmento">Segmento</Label>
              <Input id="segmento" value={data.segmento} onChange={(e) => setData({ ...data, segmento: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={data.contato_email} onChange={(e) => setData({ ...data, contato_email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tel">Telefone</Label>
              <Input id="tel" value={data.contato_telefone} onChange={(e) => setData({ ...data, contato_telefone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <textarea
              id="obs"
              className="w-full min-h-[80px] border rounded-md px-3 py-2 text-sm"
              value={data.observacoes}
              onChange={(e) => setData({ ...data, observacoes: e.target.value })}
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button type="submit" disabled={submitting}>{submitting ? 'Salvando...' : submitLabel}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Clientes list page**

Create `src/app/(dashboard)/receitas/clientes/page.tsx`:
```tsx
import Link from 'next/link'
import { listarClientes } from '@/modules/receitas/clientes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function ClientesPage() {
  const { data, total } = await listarClientes({ limit: 100 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-neutral-500">{total} cliente(s) cadastrados</p>
        </div>
        <Link href="/receitas/clientes/novo">
          <Button>Novo cliente</Button>
        </Link>
      </div>

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-left">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">CNPJ</th>
              <th className="px-4 py-3">Segmento</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            ) : data.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3 font-medium">{c.nome}</td>
                <td className="px-4 py-3 text-neutral-600">{c.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-600">{c.segmento ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={c.status === 'ativo' ? 'default' : 'secondary'}>{c.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/receitas/clientes/${c.id}`} className="text-sm underline">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: New cliente page (with server action)**

Create `src/app/(dashboard)/receitas/clientes/novo/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { criarCliente } from '@/modules/receitas/clientes'
import { ClienteForm } from '@/components/forms/cliente-form'

export default function NovoClientePage() {
  async function action(formData: { nome: string; cnpj?: string; segmento?: string; contato_email?: string; contato_telefone?: string; observacoes?: string }) {
    'use server'
    const cleaned = {
      nome: formData.nome,
      cnpj: formData.cnpj?.trim() || undefined,
      segmento: formData.segmento?.trim() || undefined,
      contato_email: formData.contato_email?.trim() || undefined,
      contato_telefone: formData.contato_telefone?.trim() || undefined,
      observacoes: formData.observacoes?.trim() || undefined,
    }
    const cliente = await criarCliente(cleaned)
    redirect(`/receitas/clientes/${cliente.id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Novo cliente</h1>
      <ClienteForm onSubmit={action} submitLabel="Criar cliente" />
    </div>
  )
}
```

- [ ] **Step 4: Cliente detail page**

Create `src/app/(dashboard)/receitas/clientes/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buscarCliente } from '@/modules/receitas/clientes'
import { listarContratos } from '@/modules/receitas/contratos'
import { listarProjetos } from '@/modules/receitas/projetos'
import { Badge } from '@/components/ui/badge'

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cliente = await buscarCliente(id)
  if (!cliente) notFound()
  const [contratos, projetos] = await Promise.all([
    listarContratos({ cliente_id: id }),
    listarProjetos({ cliente_id: id }),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{cliente.nome}</h1>
        <div className="flex gap-4 text-sm text-neutral-600 mt-2">
          {cliente.cnpj && <span>CNPJ: {cliente.cnpj}</span>}
          {cliente.segmento && <span>Segmento: {cliente.segmento}</span>}
          <Badge variant={cliente.status === 'ativo' ? 'default' : 'secondary'}>{cliente.status}</Badge>
        </div>
        {cliente.contato_email && <p className="mt-2 text-sm">Email: {cliente.contato_email}</p>}
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Contratos ({contratos.length})</h2>
          <Link href={`/receitas/contratos/novo?cliente=${id}`} className="text-sm underline">+ Novo contrato</Link>
        </div>
        {contratos.length === 0 ? (
          <p className="text-sm text-neutral-500">Sem contratos.</p>
        ) : (
          <ul className="space-y-2">
            {contratos.map((c) => (
              <li key={c.id} className="border rounded-md p-3">
                <div className="flex justify-between">
                  <div>
                    <Link href={`/receitas/contratos/${c.id}`} className="font-medium underline">{c.nome}</Link>
                    <div className="text-xs text-neutral-500">{c.tipo} · R$ {c.ticket} · desde {c.data_inicio}</div>
                  </div>
                  <Badge variant={c.status === 'ativo' ? 'default' : 'secondary'}>{c.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Projetos ({projetos.length})</h2>
          <Link href={`/receitas/projetos/novo?cliente=${id}`} className="text-sm underline">+ Novo projeto</Link>
        </div>
        {projetos.length === 0 ? (
          <p className="text-sm text-neutral-500">Sem projetos.</p>
        ) : (
          <ul className="space-y-2">
            {projetos.map((p) => (
              <li key={p.id} className="border rounded-md p-3">
                <div className="flex justify-between">
                  <div>
                    <Link href={`/receitas/projetos/${p.id}`} className="font-medium underline">{p.nome}</Link>
                    <div className="text-xs text-neutral-500">R$ {p.valor_total} · {p.data_inicio} → {p.data_prevista_fim}</div>
                  </div>
                  <Badge variant={p.status === 'ativo' ? 'default' : 'secondary'}>{p.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Manual smoke test + commit**

```bash
npm run build
git add -A
git commit -m "feat(ui): cliente CRUD pages (list, create, detail)"
```

---

### Task 15: Contrato + Projeto UI

For brevity in this plan: mirror Task 14's structure for contratos and projetos. Each gets:
- A `*-form.tsx` client component under `src/components/forms/`
- A list page at `src/app/(dashboard)/receitas/{contratos,projetos}/page.tsx`
- A new page at `src/app/(dashboard)/receitas/{contratos,projetos}/novo/page.tsx` with a server action
- A detail page at `src/app/(dashboard)/receitas/{contratos,projetos}/[id]/page.tsx`
- Project detail page also lists milestones with inline add

**Files:** ~6 new files. Pattern is identical to Task 14 — see cliente-form.tsx and adapt the field set:
- Contrato fields: cliente (select), nome, tipo (mensal/anual), ticket, dia_cobranca, data_inicio, data_fim, status
- Projeto fields: cliente (select), nome, descricao, valor_total, data_inicio, data_prevista_fim, status
- Milestone fields (inline on projeto detail): ordem, descricao, valor, data_prevista

Implementer: follow Task 14's pattern exactly, using contratos/projetos services from Task 10. The cliente picker uses a `<select>` with options loaded server-side from `listarClientes()`.

Single commit at the end:
```bash
git add -A
git commit -m "feat(ui): contrato + projeto + milestone CRUD pages"
```

---

### Task 16: Receitas overview page with MRR/ARR cards

**Files:**
- Create: `src/app/(dashboard)/receitas/page.tsx`

- [ ] **Step 1: Write page**

Create `src/app/(dashboard)/receitas/page.tsx`:
```tsx
import Link from 'next/link'
import { listarContratos } from '@/modules/receitas/contratos'
import { listarClientes } from '@/modules/receitas/clientes'
import { listarProjetos } from '@/modules/receitas/projetos'
import { calcularMRR, calcularARR } from '@/modules/receitas/metricas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function ReceitasPage() {
  const [contratos, clientes, projetos] = await Promise.all([
    listarContratos(),
    listarClientes({ limit: 1 }),
    listarProjetos(),
  ])
  const hoje = new Date().toISOString().slice(0, 10)
  const mrr = calcularMRR(contratos, hoje)
  const arr = calcularARR(contratos, hoje)
  const ativos = contratos.filter((c) => c.status === 'ativo').length
  const projetosAtivos = projetos.filter((p) => p.status === 'ativo').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Receitas</h1>
        <div className="flex gap-2">
          <Link href="/receitas/clientes"><Button variant="outline">Clientes</Button></Link>
          <Link href="/receitas/contratos"><Button variant="outline">Contratos</Button></Link>
          <Link href="/receitas/projetos"><Button variant="outline">Projetos</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm text-neutral-500">MRR</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-neutral-500">ARR</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">R$ {arr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-neutral-500">Contratos ativos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{ativos}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-neutral-500">Projetos ativos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{projetosAtivos}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Próximos passos</CardTitle></CardHeader>
        <CardContent className="text-sm text-neutral-600 space-y-1">
          <p>· <Link href="/receitas/clientes" className="underline">Cadastre clientes</Link></p>
          <p>· <Link href="/receitas/contratos" className="underline">Adicione contratos AaaS</Link> para começar a ter MRR</p>
          <p>· <Link href="/receitas/projetos" className="underline">Crie projetos</Link> com milestones para faturamento por etapa</p>
          <p>· <Link href="/contas-receber" className="underline">Veja AR previstas</Link> (gera automaticamente todo dia 1º do mês)</p>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/app/\(dashboard\)/receitas/page.tsx
git commit -m "feat(ui): receitas overview with MRR/ARR cards"
```

---

### Task 17: AR pipeline page

**Files:**
- Create: `src/components/ar-table.tsx`, `src/app/(dashboard)/contas-receber/page.tsx`

- [ ] **Step 1: AR table component**

Create `src/components/ar-table.tsx`:
```tsx
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

type ARRow = {
  id: string
  cliente: { nome: string } | null
  cliente_id: string
  origem: 'contrato' | 'milestone' | 'avulso'
  valor: number
  moeda: string
  data_emissao: string
  data_vencimento: string
  status: 'previsto' | 'emitido' | 'recebido' | 'atrasado' | 'cancelado'
}

const STATUS_VARIANT: Record<ARRow['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  previsto: 'outline',
  emitido: 'default',
  recebido: 'secondary',
  atrasado: 'destructive',
  cancelado: 'secondary',
}

export function ARTable({ rows }: { rows: ARRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">Nenhuma conta a receber.</p>
  }
  const total = rows.reduce((s, r) => s + (r.status !== 'cancelado' ? r.valor : 0), 0)

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-500">
        {rows.length} conta(s) · Total previsto: <strong>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
      </div>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-left">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Emissão</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-3">
                  <Link href={`/receitas/clientes/${r.cliente_id}`} className="underline">
                    {r.cliente?.nome ?? '—'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">{r.origem}</td>
                <td className="px-4 py-3">{r.data_emissao}</td>
                <td className="px-4 py-3">{r.data_vencimento}</td>
                <td className="px-4 py-3 text-right">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: AR page**

Create `src/app/(dashboard)/contas-receber/page.tsx`:
```tsx
import { listarAR } from '@/modules/contas-receber/ar'
import { ARTable } from '@/components/ar-table'

export default async function ContasReceberPage() {
  const hoje = new Date()
  const em90 = new Date(hoje.getTime() + 90 * 24 * 60 * 60 * 1000)
  const rows = await listarAR({
    vencimento_de: hoje.toISOString().slice(0, 10),
    vencimento_ate: em90.toISOString().slice(0, 10),
  })

  // Type narrowing — the joined cliente is loose, coerce shape
  const typed = (rows as unknown as Parameters<typeof ARTable>[0]['rows'])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas a Receber</h1>
        <p className="text-sm text-neutral-500">Próximos 90 dias</p>
      </div>
      <ARTable rows={typed} />
    </div>
  )
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add -A
git commit -m "feat(ui): contas a receber pipeline view (90d)"
```

---

### Task 18: Integration test — contract generates AR

**Files:**
- Create: `tests/integration/contrato-gera-ar.test.ts`

- [ ] **Step 1: Write test**

Create `tests/integration/contrato-gera-ar.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { gerarARDoContrato } from '@/modules/contas-receber/gerador'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('contract generates AR pipeline', () => {
  let db: ReturnType<typeof admin>
  let clienteId: string

  beforeEach(async () => {
    db = admin()
    // Create a fresh cliente per test
    const { data: c } = await db.from('clientes')
      .insert({ nome: `Acme-${Date.now()}`, status: 'ativo' })
      .select()
      .single()
    clienteId = c!.id
  })

  it('creates AR from active contract for the current month', async () => {
    // 1. Create contract
    const { data: contrato } = await db.from('contratos').insert({
      cliente_id: clienteId,
      nome: 'AaaS Pro',
      tipo: 'mensal',
      ticket: 1000,
      dia_cobranca: 10,
      data_inicio: '2026-05-01',
      status: 'ativo',
    }).select().single()
    expect(contrato).toBeTruthy()

    // 2. Use generator
    const newAR = gerarARDoContrato(contrato as never, '2026-05-01')
    expect(newAR).not.toBeNull()
    expect(newAR!.valor).toBe(1000)

    // 3. Insert
    const { data: ar, error: arErr } = await db.from('contas_a_receber').insert(newAR!).select().single()
    expect(arErr).toBeNull()
    expect(ar?.status).toBe('previsto')

    // 4. Mark as received
    const { data: updated, error: updErr } = await db
      .from('contas_a_receber')
      .update({ status: 'recebido', data_recebimento: '2026-05-12' })
      .eq('id', ar!.id)
      .select()
      .single()
    expect(updErr).toBeNull()
    expect(updated?.status).toBe('recebido')
    expect(updated?.data_recebimento).toBe('2026-05-12')
  })

  it('dedup: second insert with same contract+month fails on unique index', async () => {
    const { data: contrato } = await db.from('contratos').insert({
      cliente_id: clienteId,
      nome: 'X',
      ticket: 500,
      dia_cobranca: 1,
      data_inicio: '2026-01-01',
      status: 'ativo',
    }).select().single()

    const ar = gerarARDoContrato(contrato as never, '2026-05-01')!
    await db.from('contas_a_receber').insert(ar)

    // Try to insert duplicate
    const { error } = await db.from('contas_a_receber').insert(ar)
    expect(error?.code).toBe('23505')
  })
})
```

- [ ] **Step 2: Run**

```bash
export SUPABASE_SERVICE_ROLE_KEY=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY=" .env.local | cut -d= -f2-)
npm run test:int
```
Expected: 2 tests pass (this test + first-login bootstrap).

- [ ] **Step 3: Commit**
```bash
git add tests/integration/contrato-gera-ar.test.ts
git commit -m "test(integration): contract → AR → received pipeline + dedup check"
```

---

### Task 19: E2E — create cliente flow

**Files:**
- Create: `tests/e2e/criar-cliente.spec.ts`

- [ ] **Step 1: Add helper for authenticated session**

Add helper file `tests/e2e/helpers/auth.ts`:
```ts
import { Page } from '@playwright/test'

export async function login(page: Page, email = `e2e-${Date.now()}@iagentics.test`) {
  // Magic link flow: submit email, fetch link from Mailpit, click it
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('button', { name: /Enviar link de acesso/ }).click()
  await page.waitForSelector('text=Link de acesso enviado para')

  // Fetch the magic link from Mailpit (http://127.0.0.1:54324)
  const res = await fetch('http://127.0.0.1:54324/api/v1/messages?limit=1')
  const json = await res.json()
  const messageId = json.messages?.[0]?.ID
  if (!messageId) throw new Error('No magic link email found in Mailpit')
  const msgRes = await fetch(`http://127.0.0.1:54324/api/v1/message/${messageId}`)
  const msgJson = await msgRes.json()
  const body = msgJson.Text ?? msgJson.HTML ?? ''
  const linkMatch = body.match(/https?:\/\/[^\s"]+\/auth\/callback[^\s"]*/)
  if (!linkMatch) throw new Error('No /auth/callback link in email body')
  // Replace mailpit's recorded URL host with our app host if needed
  const link = linkMatch[0].replace(/https?:\/\/[^/]+/, 'http://localhost:3000')
  await page.goto(link)
  await page.waitForURL('http://localhost:3000/')
}
```

- [ ] **Step 2: E2E test**

Create `tests/e2e/criar-cliente.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test('create cliente and see it in the list', async ({ page }) => {
  await login(page)

  await page.goto('/receitas/clientes')
  await page.getByRole('link', { name: /Novo cliente/ }).click()

  await page.getByLabel('Nome *').fill('Acme E2E')
  await page.getByLabel('CNPJ').fill('12345678000190')
  await page.getByRole('button', { name: /Criar cliente/ }).click()

  // Lands on detail page
  await expect(page.getByRole('heading', { name: 'Acme E2E' })).toBeVisible({ timeout: 10000 })

  // Go back to list and verify
  await page.goto('/receitas/clientes')
  await expect(page.getByText('Acme E2E')).toBeVisible()
})
```

- [ ] **Step 3: Run**
```bash
npm run test:e2e
```
Expected: 3 e2e tests pass (login redirect + login form + create cliente).

- [ ] **Step 4: Commit**
```bash
git add tests/e2e
git commit -m "test(e2e): create cliente flow with magic-link login helper"
```

---

### Task 20: Verification & phase wrap-up

- [ ] **Step 1: Full suite**

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
export SUPABASE_SERVICE_ROLE_KEY=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY=" .env.local | cut -d= -f2-)
npm run test:int
npm run test:e2e
npm run build
```

All MUST pass.

- [ ] **Step 2: Phase 1 commit log**

```bash
git log --oneline 9d35eed..HEAD
```
(9d35eed is the last commit of Phase 0 — adjust if different.)

Expect ~20 commits with feat(db), feat(modules), feat(ui), test(...), chore(...) prefixes.

- [ ] **Step 3: Update README roadmap**

Edit `README.md` — change Phase 1 row from `Receitas + Contas a Receber` to `Receitas + Contas a Receber ✅`.

```bash
git add README.md
git commit -m "docs: mark Phase 1 complete in roadmap"
```

---

## Acceptance Criteria

- [ ] Lint, typecheck, unit, integration, e2e, build all green
- [ ] Migrations 0006-0010 apply cleanly
- [ ] Creating a cliente → contrato → manually invoking the cron endpoint generates an AR for the current month
- [ ] AR pipeline page lists the generated AR with correct values
- [ ] MRR / ARR cards on /receitas reflect active contracts
- [ ] Unique indexes prevent duplicate AR for same (contrato, month) or same milestone
- [ ] `withAudit` wrapper triggered when marking AR as received (audit_log row exists)
- [ ] All RLS policies prevent cross-role access (admin > financeiro > leitura)
