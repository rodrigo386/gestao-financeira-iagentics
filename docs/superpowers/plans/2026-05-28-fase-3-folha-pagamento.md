# Fase 3 — Folha de Pagamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement payroll for IAgentics — FTE funcionários (CLT + PJ recorrente), PJ Spot contractors, monthly corrida (run), holerite PDF generation, and automatic AP generation when the run closes. After this phase, the founder can open the monthly payroll, review computed salaries + benefits + encargos + provisions, close it, and see APs ready to pay for each line (salário líquido + FGTS + INSS + benefícios + provisões).

**Architecture:**
- 6 new migrations: `tabelas_fiscais` (INSS/IRRF brackets by year), `funcionarios`, `pj_spot`, `alocacoes_pj`, `folha`, `itens_folha` + `holerites`.
- Modules:
  - `src/modules/folha/funcionarios.ts` — FTE CRUD
  - `src/modules/folha/pj-spot.ts` — PJ contractor CRUD + alocações
  - `src/modules/folha/calculo.ts` — pure functions: cálculo de INSS, IRRF, FGTS, encargos, provisões (TDD)
  - `src/modules/folha/corrida.ts` — abrir/fechar corrida, gerar APs no fechamento
- `withAudit` wrapper para todas mutations sensíveis (fechar folha, reabrir folha, demissão).
- Folha fechada **gera múltiplos APs** via `inserirAPBatch` (one per: salário líquido, FGTS, INSS, VR/VA, provisão 13º, provisão férias).
- Holerite PDF gerado on-demand via `pdf-lib` (server-side), salvo no Supabase Storage, registrado em `holerites` table.

**Tech Stack:** Same as Phase 2 + `pdf-lib` (Node-friendly PDF generation, no headless browser needed).

**Out of scope** (deferred):
- DARF / eSocial / SEFIP electronic filing — these stay on the contador's side
- Multi-CNPJ / multiple employers
- Vale-transporte calculation per address
- Pension/PLR distribution
- Folha de 13º como evento separado (will be supported via accrual already, but bonus run UI deferred to Phase 3.5 if needed)
- Folha reabrir (estornar APs gerados) — out for now; closing is one-way for v1

**Prerequisites:** Phase 2 complete on `master`, last commit `64b54cb` (auth fix). 15 migrations. AP service + lancamentos already exist.

---

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/0016_tabelas_fiscais.sql` | INSS/IRRF brackets per year + 2026 seed |
| `supabase/migrations/0017_funcionarios.sql` | FTE roster |
| `supabase/migrations/0018_pj_spot.sql` | Spot contractor roster |
| `supabase/migrations/0019_alocacoes_pj.sql` | Spot job allocations |
| `supabase/migrations/0020_folha.sql` | Monthly run + items + holerites |
| `src/lib/schemas/funcionario.ts` | Zod |
| `src/lib/schemas/pj-spot.ts` | Zod (PJ + Alocacao) |
| `src/lib/schemas/folha.ts` | Zod (Folha + ItemFolha) |
| `src/modules/folha/funcionarios.ts` | CRUD |
| `src/modules/folha/pj-spot.ts` | CRUD + alocações |
| `src/modules/folha/calculo.ts` | Pure functions: INSS/IRRF/FGTS/encargos (TDD) |
| `src/modules/folha/corrida.ts` | Abrir/fechar folha, gerar APs |
| `src/modules/folha/holerite.ts` | PDF generation (uses pdf-lib) |
| `src/app/(dashboard)/folha/page.tsx` | Folha overview (current month) |
| `src/app/(dashboard)/folha/funcionarios/` (3 pages) | CRUD |
| `src/app/(dashboard)/folha/pj-spot/` (3 pages) | CRUD + alocações |
| `src/app/(dashboard)/folha/corridas/page.tsx` | List of runs |
| `src/app/(dashboard)/folha/corridas/[id]/page.tsx` | Run detail + close button |
| `src/app/api/holerite/[id]/route.ts` | PDF download endpoint (auth-gated) |
| `src/components/forms/funcionario-form.tsx` | Reusable form |
| `src/components/forms/pj-spot-form.tsx` | Reusable form |
| `src/components/forms/alocacao-form.tsx` | Reusable form |
| `tests/unit/modules/folha/calculo.test.ts` | INSS/IRRF/encargos tests |
| `tests/unit/modules/folha/corrida.test.ts` | Item building + AP generation tests |
| `tests/integration/folha-fechamento.test.ts` | Open → fechar → APs gerados |

---

## Tasks

### Task 1: Migration 0016 — tabelas_fiscais (INSS/IRRF brackets)

- [ ] **Step 1:** `supabase migration new tabelas_fiscais && mv supabase/migrations/*_tabelas_fiscais.sql supabase/migrations/0016_tabelas_fiscais.sql`

- [ ] **Step 2:** Write:

```sql
create type tabela_fiscal_tipo as enum ('inss', 'irrf');

create table public.tabelas_fiscais (
  id          uuid primary key default gen_random_uuid(),
  ano         int not null,
  tipo        tabela_fiscal_tipo not null,
  faixas_json jsonb not null,  -- [{ate: 1500.00, aliquota: 7.5, deducao: 0}, ...]
  criado_em   timestamptz not null default now(),
  unique (ano, tipo)
);

alter table public.tabelas_fiscais enable row level security;

create policy "tabelas_fiscais_select_authenticated"
  on public.tabelas_fiscais for select to authenticated using (true);

create policy "tabelas_fiscais_modify_admin"
  on public.tabelas_fiscais for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- INSS 2026 (faixas vigentes hipotéticas; ajustar conforme tabela oficial)
insert into public.tabelas_fiscais (ano, tipo, faixas_json) values
(2026, 'inss', '[
  {"ate": 1518.00,  "aliquota": 7.5,  "deducao": 0},
  {"ate": 2793.88,  "aliquota": 9.0,  "deducao": 22.77},
  {"ate": 4190.83,  "aliquota": 12.0, "deducao": 106.59},
  {"ate": 8157.41,  "aliquota": 14.0, "deducao": 190.40}
]'::jsonb),
(2026, 'irrf', '[
  {"ate": 2428.80,  "aliquota": 0,    "deducao": 0},
  {"ate": 2826.65,  "aliquota": 7.5,  "deducao": 182.16},
  {"ate": 3751.05,  "aliquota": 15.0, "deducao": 394.16},
  {"ate": 4664.68,  "aliquota": 22.5, "deducao": 675.49},
  {"ate": 999999999,"aliquota": 27.5, "deducao": 908.73}
]'::jsonb);
```

> NOTE: Brackets are illustrative for 2026; admin can edit via UI in Phase 5+ or directly in DB.

- [ ] **Step 3:** `supabase db reset`. Verify seed: `supabase db dump --data-only -f /tmp/dump.sql 2>/dev/null && grep -c tabelas_fiscais /tmp/dump.sql` (best-effort).
- [ ] **Step 4:** Commit: `feat(db): add tabelas_fiscais with 2026 INSS/IRRF seed`

---

### Task 2: Migration 0017 — funcionarios

- [ ] **Step 1:** `supabase migration new funcionarios && mv supabase/migrations/*_funcionarios.sql supabase/migrations/0017_funcionarios.sql`

- [ ] **Step 2:** Write:

```sql
create type funcionario_tipo as enum ('clt', 'pj_recorrente');

create table public.funcionarios (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  cpf                text,
  cargo              text not null,
  tipo               funcionario_tipo not null default 'clt',
  salario_base       numeric(14,2) not null check (salario_base >= 0),
  beneficios_json    jsonb not null default '{}'::jsonb,
  -- { "vr": 30, "vr_dias": 22, "va": 800, "plano_saude": 600, "plano_dental": 50 }
  encargos_pct_json  jsonb not null default '{"fgts": 8, "inss_patronal": 20, "provisao_13": 8.33, "provisao_ferias": 11.11}'::jsonb,
  centro_custo       text,
  data_admissao      date not null,
  data_desligamento  date,
  ativo              boolean not null default true,
  chave_pix          text,
  banco_conta_json   jsonb,
  usuario_id         uuid references public.usuarios(id) on delete set null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint funcionario_desligamento_apos_admissao check (
    data_desligamento is null or data_desligamento >= data_admissao
  )
);

create index funcionarios_ativo on public.funcionarios (id) where ativo;
create index funcionarios_tipo on public.funcionarios (tipo);

create trigger funcionarios_atualizado_em
  before update on public.funcionarios
  for each row execute function public.tg_set_atualizado_em();

alter table public.funcionarios enable row level security;

-- admin sees all; funcionario sees own row only
create policy "funcionarios_select_admin_or_self"
  on public.funcionarios for select to authenticated
  using (public.is_admin() or (usuario_id is not null and usuario_id = auth.uid()));

create policy "funcionarios_modify_admin"
  on public.funcionarios for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit: `feat(db): add funcionarios table (CLT/PJ recorrente) with admin/self RLS`

---

### Task 3: Migration 0018 — pj_spot

- [ ] **Step 1:** `supabase migration new pj_spot && mv supabase/migrations/*_pj_spot.sql supabase/migrations/0018_pj_spot.sql`

- [ ] **Step 2:**

```sql
create table public.pj_spot (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  cpf_cnpj           text,
  especialidade      text,
  contato_email      text,
  contato_telefone   text,
  valor_hora_padrao  numeric(12,2),
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create index pj_spot_ativo on public.pj_spot (id) where ativo;
create index pj_spot_especialidade on public.pj_spot (especialidade) where ativo;

create trigger pj_spot_atualizado_em
  before update on public.pj_spot
  for each row execute function public.tg_set_atualizado_em();

alter table public.pj_spot enable row level security;

create policy "pj_spot_select_authenticated"
  on public.pj_spot for select to authenticated using (true);

create policy "pj_spot_modify_admin"
  on public.pj_spot for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit: `feat(db): add pj_spot table`

---

### Task 4: Migration 0019 — alocacoes_pj

- [ ] **Step 1:** `supabase migration new alocacoes_pj && mv supabase/migrations/*_alocacoes_pj.sql supabase/migrations/0019_alocacoes_pj.sql`

- [ ] **Step 2:**

```sql
create type alocacao_remuneracao as enum ('fixo', 'hora', 'entregavel');
create type alocacao_status as enum ('contratado', 'em_andamento', 'concluido', 'pago');

create table public.alocacoes_pj (
  id                   uuid primary key default gen_random_uuid(),
  pj_id                uuid not null references public.pj_spot(id) on delete restrict,
  projeto_id           uuid references public.projetos(id) on delete set null,
  descricao            text not null,
  escopo               text,
  tipo_remuneracao     alocacao_remuneracao not null default 'fixo',
  valor_total          numeric(14,2) not null check (valor_total >= 0),
  horas_estimadas      numeric(8,2),
  horas_realizadas     numeric(8,2),
  data_inicio          date not null,
  data_prevista_fim    date not null,
  status               alocacao_status not null default 'contratado',
  ap_id                uuid references public.contas_a_pagar(id) on delete set null,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint alocacao_fim_apos_inicio check (data_prevista_fim >= data_inicio)
);

create index alocacoes_pj_id on public.alocacoes_pj (pj_id);
create index alocacoes_projeto on public.alocacoes_pj (projeto_id) where projeto_id is not null;
create index alocacoes_status on public.alocacoes_pj (status);

create trigger alocacoes_pj_atualizado_em
  before update on public.alocacoes_pj
  for each row execute function public.tg_set_atualizado_em();

alter table public.alocacoes_pj enable row level security;

create policy "alocacoes_select_authenticated"
  on public.alocacoes_pj for select to authenticated using (true);

create policy "alocacoes_modify_admin"
  on public.alocacoes_pj for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit: `feat(db): add alocacoes_pj with optional projeto + AP linkage`

---

### Task 5: Migration 0020 — folha + itens_folha + holerites

- [ ] **Step 1:** `supabase migration new folha && mv supabase/migrations/*_folha.sql supabase/migrations/0020_folha.sql`

- [ ] **Step 2:**

```sql
create type folha_status as enum ('aberta', 'fechada');

create table public.folha (
  id           uuid primary key default gen_random_uuid(),
  mes_ref      date not null,   -- always day=01
  status       folha_status not null default 'aberta',
  gerada_em    timestamptz not null default now(),
  fechada_em   timestamptz,
  fechada_por  uuid references public.usuarios(id) on delete set null,
  observacoes  text,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (mes_ref),
  constraint folha_mes_ref_dia_um check (extract(day from mes_ref) = 1),
  constraint folha_fechada_requer_data check (
    (status <> 'fechada') or (fechada_em is not null and fechada_por is not null)
  )
);

create index folha_mes_ref on public.folha (mes_ref desc);

create trigger folha_atualizado_em
  before update on public.folha
  for each row execute function public.tg_set_atualizado_em();

create table public.itens_folha (
  id                uuid primary key default gen_random_uuid(),
  folha_id          uuid not null references public.folha(id) on delete cascade,
  funcionario_id    uuid not null references public.funcionarios(id) on delete restrict,
  salario_bruto     numeric(14,2) not null,
  beneficios_valor  numeric(14,2) not null default 0,
  inss_funcionario  numeric(14,2) not null default 0,
  irrf              numeric(14,2) not null default 0,
  outros_descontos_json jsonb not null default '{}'::jsonb,
  liquido_pagar     numeric(14,2) not null,
  -- encargos do empregador (custo, não desconto do funcionário)
  fgts              numeric(14,2) not null default 0,
  inss_patronal     numeric(14,2) not null default 0,
  provisao_13       numeric(14,2) not null default 0,
  provisao_ferias   numeric(14,2) not null default 0,
  total_encargos    numeric(14,2) not null default 0,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  unique (folha_id, funcionario_id)
);

create index itens_folha_funcionario on public.itens_folha (funcionario_id);

create trigger itens_folha_atualizado_em
  before update on public.itens_folha
  for each row execute function public.tg_set_atualizado_em();

create table public.holerites (
  id            uuid primary key default gen_random_uuid(),
  item_folha_id uuid not null references public.itens_folha(id) on delete cascade,
  storage_path  text not null,
  gerado_em     timestamptz not null default now(),
  unique (item_folha_id)
);

create index holerites_item on public.holerites (item_folha_id);

alter table public.folha enable row level security;
alter table public.itens_folha enable row level security;
alter table public.holerites enable row level security;

-- folha: admin only (sensitive)
create policy "folha_select_admin"
  on public.folha for select to authenticated using (public.is_admin());
create policy "folha_modify_admin"
  on public.folha for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- itens_folha: admin sees all; funcionario sees own only
create policy "itens_folha_select_admin_or_self"
  on public.itens_folha for select to authenticated
  using (
    public.is_admin() or
    funcionario_id in (select id from public.funcionarios where usuario_id = auth.uid())
  );
create policy "itens_folha_modify_admin"
  on public.itens_folha for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- holerites: same as itens_folha
create policy "holerites_select_admin_or_self"
  on public.holerites for select to authenticated
  using (
    public.is_admin() or
    item_folha_id in (
      select i.id from public.itens_folha i
      join public.funcionarios f on f.id = i.funcionario_id
      where f.usuario_id = auth.uid()
    )
  );
create policy "holerites_modify_admin"
  on public.holerites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 3:** `supabase db reset`.
- [ ] **Step 4:** Commit: `feat(db): add folha + itens_folha + holerites with admin/self RLS`

---

### Task 6: Zod schemas

**Files:** `src/lib/schemas/{funcionario,pj-spot,folha}.ts` + test `tests/unit/schemas/folha.test.ts`.

- [ ] **Step 1:** Write failing test:

```ts
import { describe, it, expect } from 'vitest'
import { NewFuncionario } from '@/lib/schemas/funcionario'
import { NewPJSpot, NewAlocacao } from '@/lib/schemas/pj-spot'
import { NewFolha, NewItemFolha } from '@/lib/schemas/folha'

describe('NewFuncionario', () => {
  const valid = {
    nome: 'João Silva',
    cargo: 'Engenheiro',
    tipo: 'clt' as const,
    salario_base: 10000,
    data_admissao: '2025-01-15',
  }
  it('accepts valid', () => {
    expect(NewFuncionario.safeParse(valid).success).toBe(true)
  })
  it('rejects negative salário', () => {
    expect(NewFuncionario.safeParse({ ...valid, salario_base: -1 }).success).toBe(false)
  })
  it('rejects desligamento before admissão', () => {
    expect(NewFuncionario.safeParse({
      ...valid, data_desligamento: '2024-12-01',
    }).success).toBe(false)
  })
})

describe('NewPJSpot', () => {
  it('accepts minimal', () => {
    expect(NewPJSpot.safeParse({ nome: 'Maria PJ' }).success).toBe(true)
  })
})

describe('NewAlocacao', () => {
  const valid = {
    pj_id: '550e8400-e29b-41d4-a716-446655440000',
    descricao: 'Desenvolvimento sprint 1',
    tipo_remuneracao: 'fixo' as const,
    valor_total: 5000,
    data_inicio: '2026-05-01',
    data_prevista_fim: '2026-05-30',
  }
  it('accepts valid', () => {
    expect(NewAlocacao.safeParse(valid).success).toBe(true)
  })
  it('rejects fim before inicio', () => {
    expect(NewAlocacao.safeParse({ ...valid, data_prevista_fim: '2026-04-01' }).success).toBe(false)
  })
})

describe('NewFolha', () => {
  it('accepts dia=1 mes_ref', () => {
    expect(NewFolha.safeParse({ mes_ref: '2026-05-01' }).success).toBe(true)
  })
  it('rejects mes_ref not on day 1', () => {
    expect(NewFolha.safeParse({ mes_ref: '2026-05-15' }).success).toBe(false)
  })
})

describe('NewItemFolha', () => {
  it('accepts valid', () => {
    expect(NewItemFolha.safeParse({
      folha_id: '550e8400-e29b-41d4-a716-446655440000',
      funcionario_id: '550e8400-e29b-41d4-a716-446655440001',
      salario_bruto: 10000,
      beneficios_valor: 800,
      inss_funcionario: 1100,
      irrf: 500,
      liquido_pagar: 8400,
      fgts: 800,
      inss_patronal: 2000,
      provisao_13: 833,
      provisao_ferias: 1111,
      total_encargos: 4744,
    }).success).toBe(true)
  })
})
```

- [ ] **Step 2:** Implement schemas.

`src/lib/schemas/funcionario.ts`:
```ts
import { z } from 'zod'
import { Uuid, Money, Cpf } from './common'

export const FuncionarioTipo = z.enum(['clt', 'pj_recorrente'])

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewFuncionario = z.object({
  nome: z.string().min(1),
  cpf: Cpf.optional(),
  cargo: z.string().min(1),
  tipo: FuncionarioTipo.default('clt'),
  salario_base: Money,
  beneficios_json: z.record(z.string(), z.unknown()).optional(),
  encargos_pct_json: z.record(z.string(), z.unknown()).optional(),
  centro_custo: z.string().optional(),
  data_admissao: DateStr,
  data_desligamento: DateStr.optional(),
  ativo: z.boolean().default(true),
  chave_pix: z.string().optional(),
  banco_conta_json: z.record(z.string(), z.unknown()).optional(),
  usuario_id: Uuid.optional(),
}).refine(
  (v) => !v.data_desligamento || v.data_desligamento >= v.data_admissao,
  { message: 'data_desligamento must be on or after data_admissao', path: ['data_desligamento'] },
)

export const Funcionario = z.object({
  id: Uuid,
  nome: z.string(),
  cpf: z.string().nullable(),
  cargo: z.string(),
  tipo: FuncionarioTipo,
  salario_base: Money,
  beneficios_json: z.record(z.string(), z.unknown()),
  encargos_pct_json: z.record(z.string(), z.unknown()),
  centro_custo: z.string().nullable(),
  data_admissao: DateStr,
  data_desligamento: DateStr.nullable(),
  ativo: z.boolean(),
  chave_pix: z.string().nullable(),
  banco_conta_json: z.record(z.string(), z.unknown()).nullable(),
  usuario_id: Uuid.nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewFuncionario = z.infer<typeof NewFuncionario>
export type Funcionario = z.infer<typeof Funcionario>
```

`src/lib/schemas/pj-spot.ts`:
```ts
import { z } from 'zod'
import { Uuid, Money } from './common'

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const NewPJSpot = z.object({
  nome: z.string().min(1),
  cpf_cnpj: z.string().optional(),
  especialidade: z.string().optional(),
  contato_email: z.string().email().optional(),
  contato_telefone: z.string().optional(),
  valor_hora_padrao: Money.optional(),
  ativo: z.boolean().default(true),
})

export const PJSpot = NewPJSpot.extend({
  id: Uuid,
  ativo: z.boolean(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export const AlocacaoRemuneracao = z.enum(['fixo', 'hora', 'entregavel'])
export const AlocacaoStatus = z.enum(['contratado', 'em_andamento', 'concluido', 'pago'])

export const NewAlocacao = z.object({
  pj_id: Uuid,
  projeto_id: Uuid.optional(),
  descricao: z.string().min(1),
  escopo: z.string().optional(),
  tipo_remuneracao: AlocacaoRemuneracao.default('fixo'),
  valor_total: Money,
  horas_estimadas: z.number().nonnegative().optional(),
  horas_realizadas: z.number().nonnegative().optional(),
  data_inicio: DateStr,
  data_prevista_fim: DateStr,
  status: AlocacaoStatus.default('contratado'),
}).refine(
  (v) => v.data_prevista_fim >= v.data_inicio,
  { message: 'data_prevista_fim must be on or after data_inicio', path: ['data_prevista_fim'] },
)

export const Alocacao = z.object({
  id: Uuid,
  pj_id: Uuid,
  projeto_id: Uuid.nullable(),
  descricao: z.string(),
  escopo: z.string().nullable(),
  tipo_remuneracao: AlocacaoRemuneracao,
  valor_total: Money,
  horas_estimadas: z.number().nullable(),
  horas_realizadas: z.number().nullable(),
  data_inicio: DateStr,
  data_prevista_fim: DateStr,
  status: AlocacaoStatus,
  ap_id: Uuid.nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewPJSpot = z.infer<typeof NewPJSpot>
export type PJSpot = z.infer<typeof PJSpot>
export type NewAlocacao = z.infer<typeof NewAlocacao>
export type Alocacao = z.infer<typeof Alocacao>
```

`src/lib/schemas/folha.ts`:
```ts
import { z } from 'zod'
import { Uuid, Money } from './common'

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

export const FolhaStatus = z.enum(['aberta', 'fechada'])

export const NewFolha = z.object({
  mes_ref: DateStr.refine((s) => s.endsWith('-01'), 'mes_ref must be on day 01'),
  status: FolhaStatus.default('aberta'),
  observacoes: z.string().optional(),
})

export const Folha = z.object({
  id: Uuid,
  mes_ref: DateStr,
  status: FolhaStatus,
  gerada_em: z.string(),
  fechada_em: z.string().nullable(),
  fechada_por: Uuid.nullable(),
  observacoes: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export const NewItemFolha = z.object({
  folha_id: Uuid,
  funcionario_id: Uuid,
  salario_bruto: Money,
  beneficios_valor: Money,
  inss_funcionario: Money,
  irrf: Money,
  outros_descontos_json: z.record(z.string(), z.unknown()).optional(),
  liquido_pagar: Money,
  fgts: Money,
  inss_patronal: Money,
  provisao_13: Money,
  provisao_ferias: Money,
  total_encargos: Money,
})

export const ItemFolha = NewItemFolha.extend({
  id: Uuid,
  outros_descontos_json: z.record(z.string(), z.unknown()),
  criado_em: z.string(),
  atualizado_em: z.string(),
})

export type NewFolha = z.infer<typeof NewFolha>
export type Folha = z.infer<typeof Folha>
export type NewItemFolha = z.infer<typeof NewItemFolha>
export type ItemFolha = z.infer<typeof ItemFolha>
```

- [ ] **Step 3:** Run tests → expect 10 pass.
- [ ] **Step 4:** Commit: `feat(schemas): zod for funcionario, pj-spot, alocacao, folha, itens_folha`

---

### Task 7: Calculo service (INSS + IRRF + encargos) — TDD

**Files:** Create `src/modules/folha/calculo.ts` + test.

- [ ] **Step 1:** Write failing test `tests/unit/modules/folha/calculo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  calcularINSSFuncionario,
  calcularIRRF,
  calcularFGTS,
  calcularEncargos,
  calcularItemFolha,
} from '@/modules/folha/calculo'

const INSS_2026 = [
  { ate: 1518.00, aliquota: 7.5, deducao: 0 },
  { ate: 2793.88, aliquota: 9.0, deducao: 22.77 },
  { ate: 4190.83, aliquota: 12.0, deducao: 106.59 },
  { ate: 8157.41, aliquota: 14.0, deducao: 190.40 },
]

const IRRF_2026 = [
  { ate: 2428.80, aliquota: 0, deducao: 0 },
  { ate: 2826.65, aliquota: 7.5, deducao: 182.16 },
  { ate: 3751.05, aliquota: 15.0, deducao: 394.16 },
  { ate: 4664.68, aliquota: 22.5, deducao: 675.49 },
  { ate: 999999999, aliquota: 27.5, deducao: 908.73 },
]

describe('calcularINSSFuncionario', () => {
  it('faixa 1: 1000 → 7.5%', () => {
    // 1000 * 7.5% - 0 = 75
    expect(calcularINSSFuncionario(1000, INSS_2026)).toBeCloseTo(75, 2)
  })
  it('faixa 4: 5000 → cap at last bracket', () => {
    // 5000 * 14% - 190.40 = 509.60
    expect(calcularINSSFuncionario(5000, INSS_2026)).toBeCloseTo(509.6, 2)
  })
  it('teto: salário > último teto contribui no teto', () => {
    // 10000 > 8157.41 → 8157.41 * 14% - 190.40 = 951.638
    expect(calcularINSSFuncionario(10000, INSS_2026)).toBeCloseTo(951.638, 2)
  })
})

describe('calcularIRRF', () => {
  it('faixa isenta: 2000 → 0', () => {
    expect(calcularIRRF(2000, IRRF_2026)).toBe(0)
  })
  it('faixa 7.5%: 2700 → 7.5% * 2700 - 182.16 = 20.34', () => {
    expect(calcularIRRF(2700, IRRF_2026)).toBeCloseTo(20.34, 2)
  })
  it('faixa máxima: 10000 → 27.5% * 10000 - 908.73 = 1841.27', () => {
    expect(calcularIRRF(10000, IRRF_2026)).toBeCloseTo(1841.27, 2)
  })
})

describe('calcularFGTS', () => {
  it('8% do salário bruto', () => {
    expect(calcularFGTS(10000, 8)).toBe(800)
  })
})

describe('calcularEncargos', () => {
  it('calcula todos os encargos do empregador', () => {
    const e = calcularEncargos(10000, {
      fgts: 8,
      inss_patronal: 20,
      provisao_13: 8.33,
      provisao_ferias: 11.11,
    })
    expect(e.fgts).toBe(800)
    expect(e.inss_patronal).toBe(2000)
    expect(e.provisao_13).toBeCloseTo(833, 2)
    expect(e.provisao_ferias).toBeCloseTo(1111, 2)
    expect(e.total).toBeCloseTo(4744, 2)
  })
})

describe('calcularItemFolha', () => {
  const funcionario = {
    salario_base: 10000,
    beneficios_json: { vr: 30, vr_dias: 22, va: 800, plano_saude: 600 },
    encargos_pct_json: { fgts: 8, inss_patronal: 20, provisao_13: 8.33, provisao_ferias: 11.11 },
  }

  it('compõe item de folha com bruto + descontos + encargos', () => {
    const item = calcularItemFolha(funcionario as never, INSS_2026, IRRF_2026)

    expect(item.salario_bruto).toBe(10000)
    expect(item.beneficios_valor).toBe(30 * 22 + 800 + 600)  // 660 + 800 + 600 = 2060
    expect(item.inss_funcionario).toBeCloseTo(951.638, 2)
    // base IRRF = bruto - INSS = 10000 - 951.638 = 9048.362; faixa máxima
    // 9048.362 * 27.5% - 908.73 = 1579.57
    expect(item.irrf).toBeCloseTo(1579.57, 1)
    // liquido = bruto - INSS - IRRF
    expect(item.liquido_pagar).toBeCloseTo(10000 - 951.638 - 1579.57, 1)
    expect(item.fgts).toBe(800)
    expect(item.inss_patronal).toBe(2000)
  })
})
```

- [ ] **Step 2:** Implement `src/modules/folha/calculo.ts`:

```ts
import type { Funcionario } from '@/lib/schemas/funcionario'
import type { NewItemFolha } from '@/lib/schemas/folha'

export type FaixaFiscal = { ate: number; aliquota: number; deducao: number }

/**
 * Cálculo de INSS do funcionário (desconto progressivo com teto).
 * Se salário > teto, usa o teto como base.
 */
export function calcularINSSFuncionario(salarioBruto: number, faixas: FaixaFiscal[]): number {
  if (faixas.length === 0) return 0
  const teto = faixas[faixas.length - 1]!.ate
  const base = Math.min(salarioBruto, teto)
  const faixa = encontrarFaixa(base, faixas)
  return round2(base * (faixa.aliquota / 100) - faixa.deducao)
}

/**
 * Cálculo de IRRF (sobre base = bruto - INSS, simplificado sem dependentes).
 */
export function calcularIRRF(baseCalculo: number, faixas: FaixaFiscal[]): number {
  if (faixas.length === 0) return 0
  const faixa = encontrarFaixa(baseCalculo, faixas)
  const imposto = baseCalculo * (faixa.aliquota / 100) - faixa.deducao
  return Math.max(0, round2(imposto))
}

export function calcularFGTS(salarioBruto: number, aliquotaPct: number): number {
  return round2(salarioBruto * (aliquotaPct / 100))
}

export type EncargosPct = {
  fgts: number
  inss_patronal: number
  provisao_13: number
  provisao_ferias: number
}

export function calcularEncargos(salarioBruto: number, pct: EncargosPct) {
  const fgts = round2(salarioBruto * (pct.fgts / 100))
  const inss_patronal = round2(salarioBruto * (pct.inss_patronal / 100))
  const provisao_13 = round2(salarioBruto * (pct.provisao_13 / 100))
  const provisao_ferias = round2(salarioBruto * (pct.provisao_ferias / 100))
  return {
    fgts,
    inss_patronal,
    provisao_13,
    provisao_ferias,
    total: round2(fgts + inss_patronal + provisao_13 + provisao_ferias),
  }
}

/**
 * Compose a full payroll item from a funcionario, using the provided tax tables.
 * Returns a NewItemFolha-shaped object (without folha_id/funcionario_id — set by caller).
 */
export function calcularItemFolha(
  funcionario: Funcionario,
  inssFaixas: FaixaFiscal[],
  irrfFaixas: FaixaFiscal[],
): Omit<NewItemFolha, 'folha_id' | 'funcionario_id'> {
  const bruto = funcionario.salario_base
  const beneficiosValor = computeBeneficios(funcionario.beneficios_json)
  const inssFuncionario = calcularINSSFuncionario(bruto, inssFaixas)
  const baseIRRF = bruto - inssFuncionario
  const irrf = calcularIRRF(baseIRRF, irrfFaixas)
  const liquido = round2(bruto - inssFuncionario - irrf)

  const encargos = calcularEncargos(bruto, {
    fgts: numFromJson(funcionario.encargos_pct_json, 'fgts'),
    inss_patronal: numFromJson(funcionario.encargos_pct_json, 'inss_patronal'),
    provisao_13: numFromJson(funcionario.encargos_pct_json, 'provisao_13'),
    provisao_ferias: numFromJson(funcionario.encargos_pct_json, 'provisao_ferias'),
  })

  return {
    salario_bruto: bruto,
    beneficios_valor: beneficiosValor,
    inss_funcionario: inssFuncionario,
    irrf,
    liquido_pagar: liquido,
    fgts: encargos.fgts,
    inss_patronal: encargos.inss_patronal,
    provisao_13: encargos.provisao_13,
    provisao_ferias: encargos.provisao_ferias,
    total_encargos: encargos.total,
  }
}

function encontrarFaixa(valor: number, faixas: FaixaFiscal[]): FaixaFiscal {
  for (const f of faixas) {
    if (valor <= f.ate) return f
  }
  return faixas[faixas.length - 1]!
}

function computeBeneficios(beneficios: Record<string, unknown>): number {
  const vr = numOr0(beneficios.vr)
  const vrDias = numOr0(beneficios.vr_dias)
  const va = numOr0(beneficios.va)
  const planoSaude = numOr0(beneficios.plano_saude)
  const planoDental = numOr0(beneficios.plano_dental)
  return round2(vr * vrDias + va + planoSaude + planoDental)
}

function numOr0(v: unknown): number {
  return typeof v === 'number' ? v : 0
}

function numFromJson(json: Record<string, unknown>, key: string): number {
  const v = json[key]
  return typeof v === 'number' ? v : 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
```

- [ ] **Step 3:** Run tests → expect ~10 pass.
- [ ] **Step 4:** Commit: `feat(modules): folha calculo (INSS, IRRF, FGTS, encargos, item) with TDD`

---

### Task 8: Corrida service (abrir / fechar / gerar APs) — TDD

**Files:** Create `src/modules/folha/corrida.ts` + test.

- [ ] **Step 1:** Write failing test `tests/unit/modules/folha/corrida.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildAPsFromItem } from '@/modules/folha/corrida'
import type { ItemFolha } from '@/lib/schemas/folha'
import type { Funcionario } from '@/lib/schemas/funcionario'

const fc: Funcionario = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  nome: 'Test',
  cpf: null,
  cargo: 'Eng',
  tipo: 'clt',
  salario_base: 10000,
  beneficios_json: { vr: 30, vr_dias: 22, va: 800, plano_saude: 600 },
  encargos_pct_json: {},
  centro_custo: null,
  data_admissao: '2025-01-01',
  data_desligamento: null,
  ativo: true,
  chave_pix: null,
  banco_conta_json: null,
  usuario_id: null,
  criado_em: '2025-01-01T00:00:00Z',
  atualizado_em: '2025-01-01T00:00:00Z',
}

const item: ItemFolha = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  folha_id: '550e8400-e29b-41d4-a716-446655440002',
  funcionario_id: fc.id,
  salario_bruto: 10000,
  beneficios_valor: 2060,
  inss_funcionario: 951.64,
  irrf: 1579.57,
  outros_descontos_json: {},
  liquido_pagar: 7468.79,
  fgts: 800,
  inss_patronal: 2000,
  provisao_13: 833,
  provisao_ferias: 1111,
  total_encargos: 4744,
  criado_em: '2026-05-01T00:00:00Z',
  atualizado_em: '2026-05-01T00:00:00Z',
}

describe('buildAPsFromItem', () => {
  it('builds 4 APs: salário, FGTS, INSS, benefícios (skips zero-value benefícios)', () => {
    const aps = buildAPsFromItem(item, fc, '2026-05-01', {
      salarioCategoria: 'cat-pessoal',
      fgtsCategoria: 'cat-fgts',
      inssCategoria: 'cat-inss',
      beneficiosCategoria: 'cat-vrva',
    })
    expect(aps).toHaveLength(4)

    const sal = aps.find((a) => a.descricao.includes('Salário'))!
    expect(sal.valor).toBe(7468.79)
    expect(sal.tipo_credor).toBe('funcionario')
    expect(sal.credor_id).toBe(fc.id)
    expect(sal.categoria_id).toBe('cat-pessoal')

    const fgts = aps.find((a) => a.descricao.includes('FGTS'))!
    expect(fgts.valor).toBe(800)

    const inss = aps.find((a) => a.descricao.includes('INSS'))!
    // INSS to government = funcionario + patronal
    expect(inss.valor).toBeCloseTo(951.64 + 2000, 2)

    const ben = aps.find((a) => a.descricao.includes('Benefícios'))!
    expect(ben.valor).toBe(2060)
  })

  it('uses correct due dates: salário dia 5, FGTS dia 7, INSS dia 20, benefícios dia 5 of next month', () => {
    const aps = buildAPsFromItem(item, fc, '2026-05-01', {
      salarioCategoria: 'c1', fgtsCategoria: 'c2', inssCategoria: 'c3', beneficiosCategoria: 'c4',
    })
    const sal = aps.find((a) => a.descricao.includes('Salário'))!
    const fgts = aps.find((a) => a.descricao.includes('FGTS'))!
    const inss = aps.find((a) => a.descricao.includes('INSS'))!
    expect(sal.data_vencimento).toBe('2026-06-05')
    expect(fgts.data_vencimento).toBe('2026-06-07')
    expect(inss.data_vencimento).toBe('2026-06-20')
  })

  it('skips zero-value benefícios AP', () => {
    const itemSemBen = { ...item, beneficios_valor: 0 }
    const aps = buildAPsFromItem(itemSemBen, fc, '2026-05-01', {
      salarioCategoria: 'c1', fgtsCategoria: 'c2', inssCategoria: 'c3', beneficiosCategoria: 'c4',
    })
    expect(aps).toHaveLength(3)  // sem o de benefícios
  })
})
```

- [ ] **Step 2:** Implement `src/modules/folha/corrida.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { NewContaAPagar } from '@/lib/schemas/ap'
import type { Funcionario } from '@/lib/schemas/funcionario'
import type { Folha, ItemFolha } from '@/lib/schemas/folha'
import { calcularItemFolha, type FaixaFiscal } from './calculo'
import { withAudit } from '@/lib/audit'
import { inserirAPBatch } from '@/modules/contas-pagar/ap'

export type ListFolhasParams = { ano?: number; status?: 'aberta' | 'fechada' }

export async function listarFolhas(p: ListFolhasParams = {}) {
  const supabase = await createClient()
  let q = supabase.from('folha').select('*').order('mes_ref', { ascending: false })
  if (p.status) q = q.eq('status', p.status)
  if (p.ano) {
    q = q.gte('mes_ref', `${p.ano}-01-01`).lte('mes_ref', `${p.ano}-12-31`)
  }
  const { data, error } = await q
  if (error) throw new Error(`listarFolhas: ${error.message}`)
  return (data ?? []) as Folha[]
}

export async function buscarFolha(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('folha').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`buscarFolha: ${error.message}`)
  return data as Folha | null
}

export async function listarItensFolha(folhaId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('itens_folha')
    .select('*, funcionario:funcionarios(nome, cargo, tipo)')
    .eq('folha_id', folhaId)
  if (error) throw new Error(`listarItensFolha: ${error.message}`)
  return data ?? []
}

/**
 * Opens the run for a given month: creates the folha row + one itens_folha row
 * per active funcionario, computed via calcularItemFolha using the current year's tax tables.
 */
export async function abrirFolha(mesRef: string, usuarioId: string) {
  const supabase = await createClient()

  // Load tax tables for the year of mesRef
  const ano = parseInt(mesRef.slice(0, 4), 10)
  const { data: tabelas, error: tErr } = await supabase
    .from('tabelas_fiscais').select('*').eq('ano', ano)
  if (tErr) throw new Error(`abrirFolha: ${tErr.message}`)
  const inssRow = (tabelas ?? []).find((t) => t.tipo === 'inss')
  const irrfRow = (tabelas ?? []).find((t) => t.tipo === 'irrf')
  if (!inssRow || !irrfRow) {
    throw new Error(`abrirFolha: tabelas_fiscais para ano ${ano} não encontradas`)
  }
  const inssFaixas = inssRow.faixas_json as FaixaFiscal[]
  const irrfFaixas = irrfRow.faixas_json as FaixaFiscal[]

  // Active funcionarios at mesRef
  const { data: funcionarios, error: fErr } = await supabase
    .from('funcionarios').select('*').eq('ativo', true)
    .lte('data_admissao', mesRef)
  if (fErr) throw new Error(`abrirFolha: ${fErr.message}`)

  // Create folha
  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'insert',
      tabela: 'folha',
      registro_id: '00000000-0000-0000-0000-000000000000',  // overwritten below
      before: null,
      after: { mes_ref: mesRef },
      motivo: 'abrir folha',
    },
    async () => {
      const { data: folha, error: cErr } = await supabase
        .from('folha').insert({ mes_ref: mesRef, status: 'aberta' }).select().single()
      if (cErr) throw new Error(`abrirFolha: ${cErr.message}`)

      // Insert itens (service-role to bypass any RLS edge case)
      const admin = createServiceClient()
      const itens = (funcionarios as Funcionario[])
        .filter((f) => !f.data_desligamento || f.data_desligamento >= mesRef)
        .map((f) => ({
          folha_id: folha.id,
          funcionario_id: f.id,
          ...calcularItemFolha(f, inssFaixas, irrfFaixas),
        }))
      if (itens.length > 0) {
        const { error: iErr } = await admin.from('itens_folha').insert(itens)
        if (iErr) throw new Error(`abrirFolha (itens): ${iErr.message}`)
      }
      return folha as Folha
    },
  )
}

export type APCategorias = {
  salarioCategoria: string
  fgtsCategoria: string
  inssCategoria: string
  beneficiosCategoria: string
}

/**
 * Build APs for a single item: salário líquido, FGTS, INSS (func+patronal), benefícios.
 * Pure function — no DB writes.
 */
export function buildAPsFromItem(
  item: ItemFolha,
  funcionario: Funcionario,
  mesRef: string,
  cats: APCategorias,
): NewContaAPagar[] {
  const nextMonth = addMonths(mesRef, 1)
  const aps: NewContaAPagar[] = []

  // Salário líquido → funcionario
  aps.push({
    tipo_credor: 'funcionario',
    credor_id: funcionario.id,
    origem: 'folha',
    origem_id: item.id,
    descricao: `Salário ${funcionario.nome} ${formatMesRef(mesRef)}`,
    valor: item.liquido_pagar,
    moeda: 'BRL',
    data_vencimento: dia(nextMonth, 5),
    categoria_id: cats.salarioCategoria,
    status: 'previsto',
  })

  // FGTS → Caixa
  if (item.fgts > 0) {
    aps.push({
      tipo_credor: 'orgao_publico',
      origem: 'folha',
      origem_id: item.id,
      descricao: `FGTS ${funcionario.nome} ${formatMesRef(mesRef)}`,
      valor: item.fgts,
      moeda: 'BRL',
      data_vencimento: dia(nextMonth, 7),
      categoria_id: cats.fgtsCategoria,
      status: 'previsto',
    })
  }

  // INSS (funcionario + patronal) → Receita Federal
  const totalINSS = round2(item.inss_funcionario + item.inss_patronal)
  if (totalINSS > 0) {
    aps.push({
      tipo_credor: 'orgao_publico',
      origem: 'folha',
      origem_id: item.id,
      descricao: `INSS ${funcionario.nome} ${formatMesRef(mesRef)}`,
      valor: totalINSS,
      moeda: 'BRL',
      data_vencimento: dia(nextMonth, 20),
      categoria_id: cats.inssCategoria,
      status: 'previsto',
    })
  }

  // Benefícios externos (VR/VA → operadora) — skip if zero
  if (item.beneficios_valor > 0) {
    aps.push({
      tipo_credor: 'fornecedor',
      origem: 'folha',
      origem_id: item.id,
      descricao: `Benefícios ${funcionario.nome} ${formatMesRef(mesRef)}`,
      valor: item.beneficios_valor,
      moeda: 'BRL',
      data_vencimento: dia(nextMonth, 5),
      categoria_id: cats.beneficiosCategoria,
      status: 'previsto',
    })
  }

  return aps
}

/**
 * Close the run: generates APs for all items via buildAPsFromItem + audit log.
 */
export async function fecharFolha(folhaId: string, usuarioId: string, cats: APCategorias) {
  const supabase = await createClient()
  const { data: folha, error: fErr } = await supabase.from('folha').select('*').eq('id', folhaId).single()
  if (fErr) throw new Error(`fecharFolha: ${fErr.message}`)
  if (folha.status === 'fechada') throw new Error('folha já fechada')

  const { data: itens } = await supabase.from('itens_folha').select('*').eq('folha_id', folhaId)
  const funcIds = (itens ?? []).map((i) => i.funcionario_id)
  const { data: funcionarios } = await supabase.from('funcionarios').select('*').in('id', funcIds)

  return withAudit(
    {
      usuario_id: usuarioId,
      acao: 'update',
      tabela: 'folha',
      registro_id: folhaId,
      before: folha as Record<string, unknown>,
      after: { ...(folha as Record<string, unknown>), status: 'fechada' },
      motivo: 'fechar folha',
    },
    async () => {
      // Build APs
      const allAPs = (itens ?? []).flatMap((item) => {
        const func = (funcionarios as Funcionario[]).find((f) => f.id === item.funcionario_id)
        if (!func) return []
        return buildAPsFromItem(item as ItemFolha, func, folha.mes_ref, cats)
      })

      await inserirAPBatch(allAPs)

      // Close folha
      const { data, error } = await supabase
        .from('folha')
        .update({
          status: 'fechada',
          fechada_em: new Date().toISOString(),
          fechada_por: usuarioId,
        })
        .eq('id', folhaId).select().single()
      if (error) throw new Error(`fecharFolha: ${error.message}`)
      return data as Folha
    },
  )
}

function addMonths(dateStr: string, months: number): string {
  const parts = dateStr.split('-').map(Number)
  const y = parts[0]!; const m = parts[1]!
  const nextY = m + months > 12 ? y + Math.floor((m + months - 1) / 12) : y
  const nextM = ((m + months - 1) % 12) + 1
  return `${nextY}-${String(nextM).padStart(2, '0')}-01`
}

function dia(monthStart: string, d: number): string {
  const parts = monthStart.split('-').map(Number)
  const y = parts[0]!; const m = parts[1]!
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function formatMesRef(mesRef: string): string {
  const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
  const parts = mesRef.split('-').map(Number)
  return `${meses[parts[1]! - 1]}/${parts[0]}`
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
```

- [ ] **Step 3:** Run tests → expect ~13 pass total (10 calculo + 3 corrida).
- [ ] **Step 4:** Commit: `feat(modules): folha corrida (abrir, fechar, buildAPsFromItem) with TDD`

---

### Task 9: Funcionário + PJ Spot + Alocação services (CRUD)

**Files:** `src/modules/folha/funcionarios.ts`, `src/modules/folha/pj-spot.ts`.

Follow the pattern of `src/modules/receitas/clientes.ts`.

`src/modules/folha/funcionarios.ts`:
- `listarFuncionarios({ ativo?, tipo? })`, `buscarFuncionario(id)`, `criarFuncionario`, `atualizarFuncionario`, `desligarFuncionario(id, dataDesligamento, usuarioId)` (with `withAudit`).

`src/modules/folha/pj-spot.ts`:
- `listarPJSpot({ ativo? })`, `buscarPJSpot`, `criarPJSpot`, `atualizarPJSpot`
- `listarAlocacoes({ pj_id?, projeto_id?, status? })`, `buscarAlocacao`, `criarAlocacao`, `atualizarAlocacao`, `concluirAlocacao(id, valorFinal?, usuarioId)` (cria AP avulso + with audit)

Typecheck + commit:
```bash
npx tsc --noEmit
git add src/modules/folha/funcionarios.ts src/modules/folha/pj-spot.ts
git commit -m "feat(modules): funcionario + pj-spot + alocacao services"
```

---

### Task 10: Holerite PDF generation

**Files:** Create `src/modules/folha/holerite.ts` + `src/app/api/holerite/[id]/route.ts`.

- [ ] **Step 1:** Install pdf-lib:

```bash
npm install pdf-lib
```

- [ ] **Step 2:** Create `src/modules/folha/holerite.ts`:

```ts
import 'server-only'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createServiceClient } from '@/lib/supabase/service'
import type { ItemFolha } from '@/lib/schemas/folha'
import type { Funcionario } from '@/lib/schemas/funcionario'

/**
 * Generate a basic holerite PDF and upload to Supabase Storage.
 * Returns the storage path on success.
 *
 * The PDF is minimal (compliant CLT layout — empresa identification, funcionario,
 * mes/ano, eventos/descontos table, totals). For more elaborate layouts, swap in
 * a richer template later — interface (item + funcionario → bytes) stays stable.
 */
export async function gerarHoleritePDF(
  item: ItemFolha,
  funcionario: Funcionario,
  mesRef: string,
  organizacaoNome: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])  // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const draw = (text: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    page.drawText(text, {
      x, y,
      size: opts.size ?? 10,
      font: opts.bold ? fontBold : font,
      color: opts.color ? rgb(opts.color[0]!, opts.color[1]!, opts.color[2]!) : rgb(0, 0, 0),
    })
  }

  let y = 800
  draw(organizacaoNome, 40, y, { size: 14, bold: true }); y -= 25
  draw(`RECIBO DE PAGAMENTO ${formatMes(mesRef)}`, 40, y, { size: 12, bold: true }); y -= 30

  draw(`Funcionário: ${funcionario.nome}`, 40, y); y -= 14
  if (funcionario.cpf) { draw(`CPF: ${funcionario.cpf}`, 40, y); y -= 14 }
  draw(`Cargo: ${funcionario.cargo}`, 40, y); y -= 14
  draw(`Admissão: ${funcionario.data_admissao}`, 40, y); y -= 20

  // Eventos
  draw('EVENTOS', 40, y, { bold: true }); draw('VALOR (R$)', 450, y, { bold: true }); y -= 14
  draw('Salário base', 40, y); draw(formatBRL(item.salario_bruto), 450, y); y -= 14
  if (item.beneficios_valor > 0) {
    draw('Benefícios', 40, y); draw(formatBRL(item.beneficios_valor), 450, y); y -= 14
  }
  y -= 6

  // Descontos
  draw('DESCONTOS', 40, y, { bold: true }); draw('VALOR (R$)', 450, y, { bold: true }); y -= 14
  draw('INSS', 40, y); draw(`- ${formatBRL(item.inss_funcionario)}`, 450, y, { color: [0.7, 0, 0] }); y -= 14
  if (item.irrf > 0) {
    draw('IRRF', 40, y); draw(`- ${formatBRL(item.irrf)}`, 450, y, { color: [0.7, 0, 0] }); y -= 14
  }
  y -= 10

  draw('LÍQUIDO A RECEBER', 40, y, { bold: true })
  draw(formatBRL(item.liquido_pagar), 450, y, { bold: true }); y -= 30

  // Encargos do empregador (informativo)
  draw('Encargos do empregador (não descontados):', 40, y, { size: 8 }); y -= 12
  draw(`FGTS: ${formatBRL(item.fgts)} · INSS Patronal: ${formatBRL(item.inss_patronal)} · Provisões: ${formatBRL(item.provisao_13 + item.provisao_ferias)}`, 40, y, { size: 8 })

  return pdf.save()
}

export async function uploadHolerite(
  itemId: string,
  pdfBytes: Uint8Array,
): Promise<string> {
  const admin = createServiceClient()
  const path = `holerites/${itemId}.pdf`
  const { error } = await admin.storage
    .from('holerites')
    .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`uploadHolerite: ${error.message}`)

  await admin.from('holerites').upsert({ item_folha_id: itemId, storage_path: path })
  return path
}

function formatMes(mesRef: string): string {
  const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
  const parts = mesRef.split('-').map(Number)
  return `${meses[parts[1]! - 1]} / ${parts[0]}`
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}
```

- [ ] **Step 3:** Create `src/app/api/holerite/[id]/route.ts` to serve the PDF (auth-gated via RLS):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: holerite, error } = await supabase
    .from('holerites').select('storage_path').eq('item_folha_id', id).maybeSingle()
  if (error || !holerite) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: blob, error: dlErr } = await supabase.storage
    .from('holerites').download(holerite.storage_path)
  if (dlErr || !blob) return NextResponse.json({ error: 'download failed' }, { status: 500 })

  const buf = await blob.arrayBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="holerite-${id}.pdf"`,
    },
  })
}
```

- [ ] **Step 4:** Create Storage bucket `holerites` (private). Add to seed:

Edit `supabase/seed.sql` and append:
```sql
insert into storage.buckets (id, name, public)
values ('holerites', 'holerites', false)
on conflict (id) do nothing;
```

Run `supabase db reset` to apply seed.

- [ ] **Step 5:** Typecheck + commit:
```bash
npx tsc --noEmit
git add -A
git commit -m "feat(folha): holerite PDF generation + storage + download endpoint"
```

---

### Task 11: Hook PDF generation into fecharFolha

Modify `src/modules/folha/corrida.ts` `fecharFolha` to also generate holerites for each item after closing.

- [ ] **Step 1:** After the `inserirAPBatch(allAPs)` call and BEFORE `update folha status='fechada'`, generate holerites:

```ts
// inside fecharFolha, before updating folha status:

// Generate holerites
const { data: orgRow } = await supabase.from('organizacao').select('nome').limit(1).single()
const orgNome = (orgRow?.nome as string) ?? 'IAgentics'

for (const item of itens ?? []) {
  const func = (funcionarios as Funcionario[]).find((f) => f.id === item.funcionario_id)
  if (!func) continue
  const { gerarHoleritePDF, uploadHolerite } = await import('@/modules/folha/holerite')
  const pdfBytes = await gerarHoleritePDF(item as ItemFolha, func, folha.mes_ref, orgNome)
  await uploadHolerite(item.id, pdfBytes)
}
```

- [ ] **Step 2:** Typecheck + commit:
```bash
npx tsc --noEmit
git add src/modules/folha/corrida.ts
git commit -m "feat(folha): generate holerite PDFs on fechamento"
```

---

### Task 12: Funcionário UI (4 files)

Follow the cliente-UI pattern.

Fields:
- nome (required), cpf, cargo (required), tipo (clt | pj_recorrente)
- salario_base (number)
- benefícios (json editor — for v1: simple key-value pairs with add/remove. UX: 3 default rows for vr, va, plano_saude with number inputs)
- encargos_pct (json editor — same, default {fgts:8, inss_patronal:20, provisao_13:8.33, provisao_ferias:11.11})
- data_admissao (date), data_desligamento (date, optional)
- chave_pix, centro_custo
- ativo (checkbox)

List: nome, cargo, tipo, salário, ativo (badge)
Detail: all fields + button "Ver itens de folha" (filter folhas by funcionario)

Commit: `feat(ui): funcionario CRUD pages`

---

### Task 13: PJ Spot + Alocação UI

Follow same pattern. 6 files (3 PJ Spot + 3 Alocação inline on PJ detail).

PJ Spot fields: nome, cpf_cnpj, especialidade, contato_email, valor_hora_padrao, ativo
Alocação fields: pj (select), projeto (select, optional), descricao, tipo_remuneracao, valor_total, horas_estimadas, data_inicio, data_prevista_fim, status

PJ detail page lists current alocações in a small table with status badges, with an inline "+ Nova alocação" form.

Commit: `feat(ui): pj-spot + alocacao CRUD pages`

---

### Task 14: Folha UI (overview + corridas list + corrida detail + close action)

**Files:**
- `src/app/(dashboard)/folha/page.tsx` — Folha overview (current month status, total folha mês, # funcionários ativos, # PJ spot ativos)
- `src/app/(dashboard)/folha/corridas/page.tsx` — List of folhas (year filter)
- `src/app/(dashboard)/folha/corridas/[id]/page.tsx` — Folha detail + items table + close button
- Server actions: `abrirFolha(mesRef)`, `fecharFolha(folhaId)` — wired with revalidatePath

Folha detail table columns:
- Funcionário, Cargo, Bruto, Benefícios, INSS, IRRF, Líquido, FGTS, INSS Patronal, Provisão 13º, Provisão Férias, Total Encargos, [Holerite PDF link if exists]

Bottom totals row: sum of each numeric column.

"Fechar folha" button:
- Shows confirmation dialog with summary (X funcionários, R$ Y total bruto, Z em APs serão gerados)
- On confirm: invokes server action that calls `fecharFolha(folha.id, user.id, { salarioCategoria: <Pessoal>, fgtsCategoria: <FGTS>, inssCategoria: <INSS Patronal>, beneficiosCategoria: <VR/VA> })`. The category IDs are fetched server-side from categorias seed.
- After: status becomes 'fechada', holerite links appear, APs visible in /contas-pagar

If status='fechada' show read-only with holerite download links per item.

Commit: `feat(ui): folha overview + corridas list + corrida detail with close action`

---

### Task 15: Integration test — folha fechamento E2E

**File:** `tests/integration/folha-fechamento.test.ts`.

- [ ] Write test that:
  1. Creates an admin user + insert in usuarios
  2. Seeds 2 funcionarios (one with full benefits, one without)
  3. Inserts a folha for 2026-05-01 with itens via `calcularItemFolha`
  4. Calls direct SQL to mark fechada + insert APs (simulating fecharFolha logic)
  5. Verifies APs were created: 1 salário per funcionario + FGTS + INSS + Benefícios where applicable
  6. Verifies count of expected APs matches

(Use direct SQL inserts rather than invoking the actual `fecharFolha` server function — server-only modules can't easily run in vitest integration without bootstrapping a Next.js server. Same pattern used in `ap-fluxo-completo.test.ts`.)

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { calcularItemFolha } from '@/modules/folha/calculo'
import { buildAPsFromItem } from '@/modules/folha/corrida'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('folha fechamento', () => {
  let db: ReturnType<typeof admin>
  let usuarioId: string
  let funcionarioComBenId: string
  let funcionarioSemBenId: string

  beforeEach(async () => {
    db = admin()
    const { data: authUser } = await db.auth.admin.createUser({
      email: `folha-${Date.now()}@iagentics.test`, email_confirm: true,
    })
    usuarioId = authUser!.user!.id
    await db.from('usuarios').insert({ id: usuarioId, nome: 'FolhaAdmin', role: 'admin' })

    const { data: f1 } = await db.from('funcionarios').insert({
      nome: 'Func ComBen', cargo: 'Eng',
      salario_base: 10000,
      beneficios_json: { vr: 30, vr_dias: 22, va: 800, plano_saude: 600 },
      encargos_pct_json: { fgts: 8, inss_patronal: 20, provisao_13: 8.33, provisao_ferias: 11.11 },
      data_admissao: '2024-01-01',
    }).select().single()
    funcionarioComBenId = f1!.id

    const { data: f2 } = await db.from('funcionarios').insert({
      nome: 'Func SemBen', cargo: 'PM',
      salario_base: 5000,
      beneficios_json: {},
      encargos_pct_json: { fgts: 8, inss_patronal: 20, provisao_13: 8.33, provisao_ferias: 11.11 },
      data_admissao: '2024-06-01',
    }).select().single()
    funcionarioSemBenId = f2!.id
  })

  it('builds itens + APs correctly for closing the run', async () => {
    // Load tax tables
    const { data: tabelas } = await db.from('tabelas_fiscais').select('*').eq('ano', 2026)
    const inss = tabelas!.find((t) => t.tipo === 'inss')!.faixas_json
    const irrf = tabelas!.find((t) => t.tipo === 'irrf')!.faixas_json

    // Create folha
    const { data: folha } = await db.from('folha')
      .insert({ mes_ref: '2026-05-01', status: 'aberta' }).select().single()

    // Insert itens
    const { data: funcionarios } = await db.from('funcionarios').select('*').eq('ativo', true)
    const itensInput = (funcionarios ?? []).map((f) => ({
      folha_id: folha!.id, funcionario_id: f.id,
      ...calcularItemFolha(f as never, inss as never, irrf as never),
    }))
    const { data: itens } = await db.from('itens_folha').insert(itensInput).select()
    expect(itens).toHaveLength(2)

    // Get categorias for AP generation
    const { data: cats } = await db.from('categorias').select('id, nome')
    const findCat = (nome: string) => cats!.find((c) => c.nome === nome)!.id

    // Build APs for each item
    const allAPs = []
    for (const item of itens!) {
      const func = (funcionarios ?? []).find((f) => f.id === item.funcionario_id)!
      const aps = buildAPsFromItem(item as never, func as never, '2026-05-01', {
        salarioCategoria: findCat('Salário CLT'),
        fgtsCategoria: findCat('FGTS'),
        inssCategoria: findCat('INSS Patronal'),
        beneficiosCategoria: findCat('VR/VA'),
      })
      allAPs.push(...aps)
    }

    // Funcionario com benefícios → 4 APs; sem benefícios → 3 APs (no benefícios AP)
    expect(allAPs.length).toBe(4 + 3)

    // Insert APs
    for (const ap of allAPs) {
      const { error } = await db.from('contas_a_pagar').insert(ap)
      expect(error).toBeNull()
    }

    // Close folha
    const { data: closed } = await db.from('folha')
      .update({ status: 'fechada', fechada_em: new Date().toISOString(), fechada_por: usuarioId })
      .eq('id', folha!.id).select().single()
    expect(closed?.status).toBe('fechada')

    // Verify the APs are queryable from contas_a_pagar
    const { data: createdAPs } = await db.from('contas_a_pagar')
      .select('*').eq('origem', 'folha').in('origem_id', itens!.map((i) => i.id))
    expect(createdAPs?.length).toBe(7)
  })
})
```

- [ ] Run: `npm run test:int`. Expected: 7 integration tests pass total.
- [ ] Commit: `test(integration): folha fechamento gera APs por item corretamente`

---

### Task 16: Verification & phase wrap-up

- [ ] Run full suite:
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

- [ ] Update `README.md` — mark Phase 3 complete: `| 3 ✅ | Folha de Pagamento |`.
- [ ] Commit: `docs: mark Phase 3 complete in roadmap`

---

## Acceptance Criteria

- [ ] All lint/typecheck/test tiers green
- [ ] Migrations 0016-0020 apply cleanly
- [ ] Creating funcionários + abrir folha computes correct INSS / IRRF / encargos / líquido per row
- [ ] Fechar folha produces N APs per item (salário + FGTS + INSS + opt. benefícios)
- [ ] Holerite PDF generated for each item, downloadable via /api/holerite/[id]
- [ ] PJ spot can be created with alocações linked to projetos
- [ ] RLS: funcionário comum vê apenas próprio holerite/itens_folha; admin vê tudo
- [ ] Audit log records `abrirFolha` / `fecharFolha` / `desligarFuncionario`
