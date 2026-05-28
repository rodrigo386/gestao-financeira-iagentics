# Fase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a deployable Next.js 15 + Supabase application with magic-link auth, role-based RLS scaffolding, audit logging, protected layout shell with sidebar nav for all future modules, automated tests, and CI.

**Architecture:** Next.js 15 App Router (TypeScript strict) on Vercel; Supabase Postgres 16 (local Docker for dev, hosted for staging/prod) holding all business data, RLS-enforced from day one. Auth flow uses Supabase magic links. Every mutation to sensitive tables passes through an `audit` wrapper that writes to `audit_log`. Vitest for unit/integration, Playwright for E2E, GitHub Actions for CI.

**Tech Stack:** Next.js 15.x, React 19, TypeScript 5.x, Tailwind 4, shadcn/ui, Supabase JS v2, Zod, Vitest, Playwright, GitHub Actions.

**Working directory assumption:** all relative paths are from project root (`<repo>/`). Engineer should `cd` into the project root before running commands. The host filesystem path is `c:/Users/rgoal/Desktop/IAgentics/Gestao IAgentics/`; quote paths containing spaces.

**Prerequisite tooling:** Node 20+, npm 10+, Docker Desktop (running), Supabase CLI (`npm i -g supabase`), git.

---

## File Structure

Files this phase will create:

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts` | Project config |
| `.env.example`, `.env.local` (gitignored) | Environment template |
| `.gitignore`, `.gitattributes` | Git hygiene |
| `supabase/config.toml` | Supabase local config |
| `supabase/migrations/0001_init.sql` | `organizacao`, `usuarios`, helper `current_role()` |
| `supabase/migrations/0002_audit.sql` | `audit_log` table + RLS |
| `supabase/migrations/0003_categorias.sql` | `categorias` table + seed |
| `supabase/migrations/0004_contas_bancarias.sql` | `contas_bancarias` table |
| `supabase/seed.sql` | Single organizacao row + first admin |
| `src/lib/supabase/server.ts` | Server-side Supabase client (RSC, route handlers) |
| `src/lib/supabase/browser.ts` | Browser Supabase client (client components) |
| `src/lib/supabase/middleware.ts` | Auth middleware client |
| `src/lib/audit.ts` | `withAudit()` wrapper for sensitive mutations |
| `src/lib/schemas/common.ts` | Shared Zod schemas (uuid, money, etc) |
| `src/middleware.ts` | Next.js middleware (auth check, redirect to /login) |
| `src/app/layout.tsx` | Root layout (fonts, providers) |
| `src/app/globals.css` | Tailwind imports |
| `src/app/login/page.tsx` | Magic link login form |
| `src/app/auth/callback/route.ts` | Magic link callback handler |
| `src/app/(dashboard)/layout.tsx` | Protected layout w/ sidebar |
| `src/app/(dashboard)/page.tsx` | Dashboard placeholder |
| `src/components/sidebar.tsx` | Nav sidebar (all module links) |
| `src/components/ui/*` | shadcn primitives (button, input, card) |
| `vitest.config.ts`, `tests/unit/audit.test.ts` | Unit test setup + first test |
| `playwright.config.ts`, `tests/e2e/login.spec.ts` | E2E setup + first test |
| `.github/workflows/ci.yml` | Lint + typecheck + unit + e2e on PR |
| `README.md` | Setup instructions |

Files this phase does NOT create (future phases):
- Business tables (clientes, contratos, AR, AP, folha, etc) — phases 1-3
- Pluggy integration — phase 4
- Forecast tables — phase 5
- Dashboard widgets — phase 6

---

## Tasks

### Task 1: Initialize Next.js 15 project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`

- [ ] **Step 1: Run create-next-app**

```bash
npx create-next-app@latest . \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --no-turbopack --use-npm
```

Expected: scaffolds the project. Accept "Yes" to any "directory not empty" prompt only if it lists only `docs/` (our spec/plan dir). If it lists anything else, abort and investigate.

- [ ] **Step 2: Pin Node and lock strict TypeScript**

Edit `package.json` and add `"engines": { "node": ">=20" }` after `"version"`.

Edit `tsconfig.json` — verify these settings exist (add if missing):
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

- [ ] **Step 3: Verify dev server boots**

```bash
npm run dev
```

Open http://localhost:3000 in browser, see Next.js welcome page. Kill with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git init
git add -A
git commit -m "chore: initialize Next.js 15 + TypeScript + Tailwind project"
```

---

### Task 2: Install shadcn/ui base + first primitives

**Files:**
- Create: `components.json`, `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/card.tsx`, `src/components/ui/label.tsx`, `src/lib/utils.ts`

- [ ] **Step 1: Initialize shadcn**

```bash
npx shadcn@latest init -y -d
```

When prompted accept defaults. Should create `components.json`, `src/lib/utils.ts`, update `globals.css`.

- [ ] **Step 2: Add the 4 primitives we need now**

```bash
npx shadcn@latest add button input card label
```

Expected: files appear under `src/components/ui/`.

- [ ] **Step 3: Verify build still passes**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: install shadcn/ui base + button/input/card/label primitives"
```

---

### Task 3: Initialize Supabase local

**Files:**
- Create: `supabase/config.toml` (auto), `supabase/seed.sql`
- Modify: `.gitignore` (ensure `supabase/.branches`, `supabase/.temp` ignored)

- [ ] **Step 1: Initialize Supabase project**

```bash
supabase init
```

Accept defaults (no VS Code/IntelliJ helper).

- [ ] **Step 2: Start local stack**

```bash
supabase start
```

Wait ~1 min on first run (pulls Docker images). Output prints API URL, anon key, service role key, DB URL. **Copy these — you'll need them for `.env.local` in Task 4.**

If it fails because Docker isn't running, start Docker Desktop and retry.

- [ ] **Step 3: Confirm `supabase status` is healthy**

```bash
supabase status
```

Expected: all services show running.

- [ ] **Step 4: Append Supabase entries to `.gitignore`**

Edit `.gitignore`, append:
```
# supabase
supabase/.branches
supabase/.temp
supabase/.env
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: initialize Supabase local stack"
```

---

### Task 4: Wire environment variables

**Files:**
- Create: `.env.example`, `.env.local` (gitignored, not committed)

- [ ] **Step 1: Create `.env.example`**

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 2: Create `.env.local` with values from `supabase start` output**

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste anon key from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 3: Verify `.env.local` is in `.gitignore`**

It should already be (from `create-next-app`). Confirm with:
```bash
git check-ignore .env.local
```
Expected output: `.env.local`

- [ ] **Step 4: Commit (only `.env.example`)**

```bash
git add .env.example
git commit -m "chore: add env template"
```

---

### Task 5: Migration 0001 — organizacao, usuarios, role helper

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Test: `tests/unit/migrations/0001_init.test.ts` (we test via DB query in integration tier later; for now just lint-check migration applies)

- [ ] **Step 1: Generate migration file**

```bash
supabase migration new init
```

This creates `supabase/migrations/<timestamp>_init.sql`. Rename it to `0001_init.sql` for predictable ordering:
```bash
mv supabase/migrations/*_init.sql supabase/migrations/0001_init.sql
```

- [ ] **Step 2: Write the migration**

Replace contents of `supabase/migrations/0001_init.sql`:

```sql
-- organizacao: single-row config for IAgentics
create table public.organizacao (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  cnpj         text,
  regime_tributario text not null check (regime_tributario in ('simples', 'lucro_presumido', 'lucro_real')),
  moeda_padrao text not null default 'BRL',
  mes_fiscal_inicio int not null default 1 check (mes_fiscal_inicio between 1 and 12),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- enforce single row
create unique index organizacao_singleton on public.organizacao ((1));

-- usuarios: app-level user data linked to auth.users
create type user_role as enum ('admin', 'financeiro', 'leitura');

create table public.usuarios (
  id    uuid primary key references auth.users(id) on delete cascade,
  nome  text not null,
  role  user_role not null default 'leitura',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- helper: current user's role (used by RLS policies)
create or replace function public.current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.usuarios where id = auth.uid()
$$;

-- helper: is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.usuarios where id = auth.uid()), false)
$$;

-- helper: can write (admin or financeiro)
create or replace function public.can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('admin', 'financeiro') from public.usuarios where id = auth.uid()), false)
$$;

-- RLS: usuarios
alter table public.usuarios enable row level security;

create policy "usuarios_select_authenticated"
  on public.usuarios for select
  to authenticated
  using (true);

create policy "usuarios_insert_admin"
  on public.usuarios for insert
  to authenticated
  with check (public.is_admin());

create policy "usuarios_update_admin_or_self"
  on public.usuarios for update
  to authenticated
  using (public.is_admin() or id = auth.uid())
  with check (public.is_admin() or id = auth.uid());

create policy "usuarios_delete_admin"
  on public.usuarios for delete
  to authenticated
  using (public.is_admin());

-- RLS: organizacao
alter table public.organizacao enable row level security;

create policy "organizacao_select_authenticated"
  on public.organizacao for select
  to authenticated
  using (true);

create policy "organizacao_modify_admin"
  on public.organizacao for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- atualizado_em trigger
create or replace function public.tg_set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

create trigger organizacao_atualizado_em
  before update on public.organizacao
  for each row execute function public.tg_set_atualizado_em();
```

- [ ] **Step 3: Apply migration locally**

```bash
supabase db reset
```

Expected: runs all migrations + `seed.sql` cleanly. No errors.

- [ ] **Step 4: Verify schema**

```bash
supabase db diff --schema public
```

Expected: no diff (DB matches migrations).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat(db): add organizacao, usuarios, role helpers + RLS"
```

---

### Task 6: Migration 0002 — audit_log

**Files:**
- Create: `supabase/migrations/0002_audit.sql`

- [ ] **Step 1: Create migration file**

```bash
supabase migration new audit
mv supabase/migrations/*_audit.sql supabase/migrations/0002_audit.sql
```

- [ ] **Step 2: Write the migration**

Replace contents of `supabase/migrations/0002_audit.sql`:

```sql
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid references public.usuarios(id) on delete set null,
  acao        text not null check (acao in ('insert', 'update', 'delete', 'custom')),
  tabela      text not null,
  registro_id uuid,
  before_json jsonb,
  after_json  jsonb,
  motivo      text,
  contexto_json jsonb,
  criado_em   timestamptz not null default now()
);

create index audit_log_tabela_registro on public.audit_log (tabela, registro_id, criado_em desc);
create index audit_log_usuario on public.audit_log (usuario_id, criado_em desc);

alter table public.audit_log enable row level security;

-- only admin can read
create policy "audit_log_select_admin"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());

-- inserts come from service_role (server-side audit wrapper); no client-side insert policy
-- updates and deletes are not allowed (append-only)
```

- [ ] **Step 3: Apply & verify**

```bash
supabase db reset
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_audit.sql
git commit -m "feat(db): add audit_log table (append-only, admin-read)"
```

---

### Task 7: Migration 0003 — categorias + standard seed

**Files:**
- Create: `supabase/migrations/0003_categorias.sql`

- [ ] **Step 1: Create migration file**

```bash
supabase migration new categorias
mv supabase/migrations/*_categorias.sql supabase/migrations/0003_categorias.sql
```

- [ ] **Step 2: Write the migration**

Replace contents of `supabase/migrations/0003_categorias.sql`:

```sql
create type categoria_tipo as enum ('receita', 'despesa', 'transferencia');

create table public.categorias (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  tipo      categoria_tipo not null,
  parent_id uuid references public.categorias(id) on delete restrict,
  cor       text,
  icone     text,
  ativa     boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (nome, parent_id)
);

create index categorias_tipo on public.categorias (tipo) where ativa;
create index categorias_parent on public.categorias (parent_id);

alter table public.categorias enable row level security;

create policy "categorias_select_authenticated"
  on public.categorias for select
  to authenticated using (true);

create policy "categorias_modify_can_write"
  on public.categorias for all
  to authenticated
  using (public.can_write())
  with check (public.can_write());

-- standard chart of accounts (small Brazilian SaaS startup)
insert into public.categorias (nome, tipo) values
  ('Receita Recorrente (AaaS)', 'receita'),
  ('Receita de Projetos', 'receita'),
  ('Outras Receitas', 'receita'),
  ('Pessoal', 'despesa'),
  ('Operacional', 'despesa'),
  ('Marketing e Vendas', 'despesa'),
  ('Tecnologia', 'despesa'),
  ('Administrativo', 'despesa'),
  ('Impostos e Encargos', 'despesa'),
  ('Financeiras', 'despesa');

-- children
with parents as (select id, nome from public.categorias where parent_id is null)
insert into public.categorias (nome, tipo, parent_id)
select sub.nome, sub.tipo::categoria_tipo, p.id
from (values
  ('Salário CLT',        'despesa', 'Pessoal'),
  ('Pró-labore',         'despesa', 'Pessoal'),
  ('PJ Recorrente',      'despesa', 'Pessoal'),
  ('PJ Spot',            'despesa', 'Pessoal'),
  ('FGTS',               'despesa', 'Pessoal'),
  ('INSS Patronal',      'despesa', 'Pessoal'),
  ('VR/VA',              'despesa', 'Pessoal'),
  ('Plano de Saúde',     'despesa', 'Pessoal'),
  ('Provisão 13º',       'despesa', 'Pessoal'),
  ('Provisão Férias',    'despesa', 'Pessoal'),
  ('Aluguel',            'despesa', 'Operacional'),
  ('Coworking',          'despesa', 'Operacional'),
  ('Anúncios Pagos',     'despesa', 'Marketing e Vendas'),
  ('Eventos',            'despesa', 'Marketing e Vendas'),
  ('Contratos Software', 'despesa', 'Tecnologia'),
  ('LLM/API',            'despesa', 'Tecnologia'),
  ('Cloud',              'despesa', 'Tecnologia'),
  ('Contabilidade',      'despesa', 'Administrativo'),
  ('Jurídico',           'despesa', 'Administrativo'),
  ('Simples Nacional (DAS)', 'despesa', 'Impostos e Encargos'),
  ('Tarifas Bancárias',  'despesa', 'Financeiras'),
  ('Juros e IOF',        'despesa', 'Financeiras')
) as sub(nome, tipo, parent_nome)
join parents p on p.nome = sub.parent_nome;
```

- [ ] **Step 3: Apply & verify**

```bash
supabase db reset
```

Then check seeds applied:
```bash
supabase db remote exec "select count(*) from public.categorias;" 2>/dev/null \
  || psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "select count(*) from public.categorias;"
```
Expected: count ≥ 32.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_categorias.sql
git commit -m "feat(db): add categorias tree + standard chart of accounts seed"
```

---

### Task 8: Migration 0004 — contas_bancarias

**Files:**
- Create: `supabase/migrations/0004_contas_bancarias.sql`

- [ ] **Step 1: Create migration file**

```bash
supabase migration new contas_bancarias
mv supabase/migrations/*_contas_bancarias.sql supabase/migrations/0004_contas_bancarias.sql
```

- [ ] **Step 2: Write the migration**

Replace contents of `supabase/migrations/0004_contas_bancarias.sql`:

```sql
create type conta_tipo as enum ('cc', 'poupanca', 'investimento');

create table public.contas_bancarias (
  id           uuid primary key default gen_random_uuid(),
  banco        text not null,
  agencia      text,
  conta        text,
  tipo         conta_tipo not null default 'cc',
  moeda        text not null default 'BRL',
  saldo_atual  numeric(14,2) not null default 0,
  pluggy_account_id text unique,
  ativa        boolean not null default true,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger contas_bancarias_atualizado_em
  before update on public.contas_bancarias
  for each row execute function public.tg_set_atualizado_em();

alter table public.contas_bancarias enable row level security;

create policy "contas_select_authenticated"
  on public.contas_bancarias for select
  to authenticated using (true);

create policy "contas_modify_admin"
  on public.contas_bancarias for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

- [ ] **Step 3: Apply & verify**

```bash
supabase db reset
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_contas_bancarias.sql
git commit -m "feat(db): add contas_bancarias table"
```

---

### Task 9: Seed file — organizacao + admin user

**Files:**
- Create/modify: `supabase/seed.sql`

- [ ] **Step 1: Write seed**

Replace contents of `supabase/seed.sql`:

```sql
-- organizacao single row
insert into public.organizacao (nome, cnpj, regime_tributario, moeda_padrao)
values ('IAgentics', null, 'simples', 'BRL')
on conflict do nothing;

-- dev admin user (must exist in auth.users first; created via supabase auth signup or magic link)
-- nothing to seed here; usuarios row is auto-created on first login (see Task 12 callback)
```

- [ ] **Step 2: Apply**

```bash
supabase db reset
```

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "chore(db): seed organizacao row"
```

---

### Task 10: Install Supabase JS clients + Zod

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install deps**

```bash
npm install @supabase/supabase-js @supabase/ssr zod
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @supabase/ssr + zod"
```

---

### Task 11: Supabase client helpers

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/middleware.ts`, `src/lib/supabase/service.ts`

- [ ] **Step 1: Server client**

Create `src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // called from RSC — ignore
          }
        },
      },
    },
  )
}
```

- [ ] **Step 2: Browser client**

Create `src/lib/supabase/browser.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 3: Middleware client**

Create `src/lib/supabase/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  return { response, user }
}
```

- [ ] **Step 4: Service-role client (server-only, for audit + admin operations)**

Create `src/lib/supabase/service.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

// server-only client that bypasses RLS — use sparingly, only for audit + system jobs
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase
git commit -m "feat(lib): add supabase server/browser/middleware/service clients"
```

---

### Task 12: Common Zod schemas

**Files:**
- Create: `src/lib/schemas/common.ts`
- Test: `tests/unit/schemas/common.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/schemas/common.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Uuid, Money, Cnpj, Cpf } from '@/lib/schemas/common'

describe('Uuid', () => {
  it('accepts valid v4 uuid', () => {
    expect(Uuid.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true)
  })
  it('rejects non-uuid', () => {
    expect(Uuid.safeParse('abc').success).toBe(false)
  })
})

describe('Money', () => {
  it('accepts positive decimal up to 2dp', () => {
    expect(Money.safeParse(100).success).toBe(true)
    expect(Money.safeParse(100.50).success).toBe(true)
  })
  it('rejects negative', () => {
    expect(Money.safeParse(-1).success).toBe(false)
  })
  it('rejects >2 decimal places', () => {
    expect(Money.safeParse(1.234).success).toBe(false)
  })
})

describe('Cnpj', () => {
  it('accepts 14-digit cnpj', () => {
    expect(Cnpj.safeParse('12345678000190').success).toBe(true)
  })
  it('accepts formatted cnpj', () => {
    expect(Cnpj.safeParse('12.345.678/0001-90').success).toBe(true)
  })
  it('rejects too short', () => {
    expect(Cnpj.safeParse('123').success).toBe(false)
  })
})

describe('Cpf', () => {
  it('accepts 11-digit cpf', () => {
    expect(Cpf.safeParse('12345678901').success).toBe(true)
  })
  it('rejects too short', () => {
    expect(Cpf.safeParse('123').success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

(Vitest isn't installed yet — install it first.)
```bash
npm install -D vitest @vitest/ui @vitejs/plugin-react jsdom
```

Create minimal `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Now run:
```bash
npx vitest run tests/unit/schemas/common.test.ts
```
Expected: FAIL with module-not-found for `@/lib/schemas/common`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/schemas/common.ts`:
```ts
import { z } from 'zod'

export const Uuid = z.string().uuid()

export const Money = z
  .number()
  .nonnegative()
  .refine((v) => Number.isFinite(v) && Math.round(v * 100) === v * 100, {
    message: 'must have at most 2 decimal places',
  })

const digits = (s: string) => s.replace(/\D/g, '')

export const Cnpj = z
  .string()
  .transform(digits)
  .refine((s) => s.length === 14, { message: 'cnpj must have 14 digits' })

export const Cpf = z
  .string()
  .transform(digits)
  .refine((s) => s.length === 11, { message: 'cpf must have 11 digits' })

export const Moeda = z.enum(['BRL', 'USD', 'EUR']).default('BRL')
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src tests vitest.config.ts package.json package-lock.json
git commit -m "feat(lib): add common Zod schemas (Uuid, Money, Cnpj, Cpf, Moeda) + vitest"
```

---

### Task 13: Audit wrapper

**Files:**
- Create: `src/lib/audit.ts`
- Test: `tests/unit/audit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/audit.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withAudit } from '@/lib/audit'

const insertMock = vi.fn().mockResolvedValue({ error: null })
const fromMock = vi.fn(() => ({ insert: insertMock }))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: fromMock }),
}))

describe('withAudit', () => {
  beforeEach(() => {
    insertMock.mockClear()
    fromMock.mockClear()
  })

  it('logs an update action with before/after diff', async () => {
    await withAudit(
      {
        usuario_id: '11111111-1111-1111-1111-111111111111',
        acao: 'update',
        tabela: 'contas_a_pagar',
        registro_id: '22222222-2222-2222-2222-222222222222',
        before: { valor: 100 },
        after: { valor: 200 },
        motivo: 'correção',
      },
      async () => 'result',
    )

    expect(fromMock).toHaveBeenCalledWith('audit_log')
    expect(insertMock).toHaveBeenCalledWith({
      usuario_id: '11111111-1111-1111-1111-111111111111',
      acao: 'update',
      tabela: 'contas_a_pagar',
      registro_id: '22222222-2222-2222-2222-222222222222',
      before_json: { valor: 100 },
      after_json: { valor: 200 },
      motivo: 'correção',
      contexto_json: null,
    })
  })

  it('returns the operation result', async () => {
    const result = await withAudit(
      {
        usuario_id: '11111111-1111-1111-1111-111111111111',
        acao: 'insert',
        tabela: 'clientes',
        registro_id: '33333333-3333-3333-3333-333333333333',
        before: null,
        after: { nome: 'Acme' },
      },
      async () => ({ ok: true }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('does not swallow operation errors', async () => {
    await expect(
      withAudit(
        {
          usuario_id: '11111111-1111-1111-1111-111111111111',
          acao: 'delete',
          tabela: 'clientes',
          registro_id: '44444444-4444-4444-4444-444444444444',
          before: { nome: 'X' },
          after: null,
        },
        async () => {
          throw new Error('boom')
        },
      ),
    ).rejects.toThrow('boom')

    // audit should NOT be written if the operation failed
    expect(insertMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/audit.test.ts
```
Expected: FAIL with module-not-found for `@/lib/audit`.

- [ ] **Step 3: Write implementation**

Create `src/lib/audit.ts`:
```ts
import { createServiceClient } from '@/lib/supabase/service'

export type AuditEntry = {
  usuario_id: string
  acao: 'insert' | 'update' | 'delete' | 'custom'
  tabela: string
  registro_id: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  motivo?: string
  contexto?: Record<string, unknown>
}

/**
 * Wraps a sensitive mutation. The operation runs first; only on success is the
 * audit row written. If audit insert fails, the error is thrown (operation
 * already happened — alerting beats silent loss).
 */
export async function withAudit<T>(
  entry: AuditEntry,
  op: () => Promise<T>,
): Promise<T> {
  const result = await op()

  const supabase = createServiceClient()
  const { error } = await supabase.from('audit_log').insert({
    usuario_id: entry.usuario_id,
    acao: entry.acao,
    tabela: entry.tabela,
    registro_id: entry.registro_id,
    before_json: entry.before,
    after_json: entry.after,
    motivo: entry.motivo ?? null,
    contexto_json: entry.contexto ?? null,
  })

  if (error) throw new Error(`audit write failed: ${error.message}`)
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/unit/audit.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit.ts tests/unit/audit.test.ts
git commit -m "feat(lib): add withAudit wrapper for sensitive mutations"
```

---

### Task 14: Auth middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Write middleware**

Create `src/middleware.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const PUBLIC_PATHS = ['/login', '/auth/callback']

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const path = request.nextUrl.pathname

  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }
  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 2: Verify dev server still boots**

```bash
npm run dev
```
Open http://localhost:3000 — should redirect to `/login` (404 for now, that's expected; Task 15 adds the page). Kill server.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(auth): add middleware that redirects unauthenticated to /login"
```

---

### Task 15: Login page (magic link)

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`

- [ ] **Step 1: Login page**

Create `src/app/login/page.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrMsg(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setStatus('error')
      setErrMsg(error.message)
      return
    }
    setStatus('sent')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar — IAgentics Finanças</CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'sent' ? (
            <p className="text-sm">Link de acesso enviado para <strong>{email}</strong>. Verifique seu e-mail.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@iagentics.com"
                />
              </div>
              <Button type="submit" className="w-full" disabled={status === 'sending'}>
                {status === 'sending' ? 'Enviando...' : 'Enviar link de acesso'}
              </Button>
              {errMsg && <p className="text-sm text-red-600">{errMsg}</p>}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Callback route**

Create `src/app/auth/callback/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=exchange_failed', request.url))
  }

  // ensure usuarios row exists (first-login bootstrap)
  const admin = createServiceClient()
  await admin.from('usuarios').upsert(
    {
      id: data.user.id,
      nome: data.user.email?.split('@')[0] ?? 'Usuário',
      // FIRST USER IS ADMIN — guarded by checking if any admin already exists
      role: await firstUserShouldBeAdmin(admin) ? 'admin' : 'leitura',
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )

  return NextResponse.redirect(new URL(next, request.url))
}

async function firstUserShouldBeAdmin(admin: ReturnType<typeof createServiceClient>) {
  const { count } = await admin
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
  return (count ?? 0) === 0
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/login src/app/auth
git commit -m "feat(auth): magic link login page + callback (bootstraps first admin)"
```

---

### Task 16: Sidebar component

**Files:**
- Create: `src/components/sidebar.tsx`

- [ ] **Step 1: Write component**

Create `src/components/sidebar.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/',                  label: 'Dashboard' },
  { href: '/receitas',          label: 'Receitas' },
  { href: '/contas-receber',    label: 'Contas a Receber' },
  { href: '/despesas',          label: 'Despesas' },
  { href: '/contas-pagar',      label: 'Contas a Pagar' },
  { href: '/folha',             label: 'Folha de Pagamento' },
  { href: '/fluxo-caixa',       label: 'Fluxo de Caixa' },
  { href: '/forecast',          label: 'Forecast' },
  { href: '/relatorios',        label: 'Relatórios' },
  { href: '/config',            label: 'Configurações' },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-64 border-r bg-neutral-50 dark:bg-neutral-950 min-h-screen p-4">
      <div className="font-semibold mb-6 px-2">IAgentics Finanças</div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                'px-3 py-2 rounded-md text-sm transition-colors ' +
                (active
                  ? 'bg-neutral-200 dark:bg-neutral-800 font-medium'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-900')
              }
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(ui): sidebar nav with all future module links"
```

---

### Task 17: Protected dashboard layout + home placeholder

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/page.tsx`
- Delete: `src/app/page.tsx` (replaced by `(dashboard)/page.tsx`)

- [ ] **Step 1: Remove default Next.js page**

```bash
rm src/app/page.tsx
```

- [ ] **Step 2: Dashboard layout**

Create `src/app/(dashboard)/layout.tsx`:
```tsx
import { Sidebar } from '@/components/sidebar'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Home placeholder**

Create `src/app/(dashboard)/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nome, role')
    .eq('id', user!.id)
    .single()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-neutral-600">
        Olá, <strong>{usuario?.nome ?? user!.email}</strong> ({usuario?.role ?? '?'}).
      </p>
      <p className="text-sm text-neutral-500">
        Os módulos serão preenchidos nas próximas fases. Use o menu lateral para navegar
        — links inativos retornarão 404 até a fase correspondente.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Open http://localhost:3000:
1. You're redirected to `/login`.
2. Submit your email. Open the Mailpit UI at http://127.0.0.1:54324 (Supabase local mail catcher) to grab the magic link.
3. Click the link → redirected back to `/` (dashboard).
4. You see "Dashboard" + your email + role `admin` (first user).
5. Sidebar visible with all module links.

Kill server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): protected dashboard layout + home placeholder with user info"
```

---

### Task 18: Vitest integration test — first-login bootstrap creates admin

**Files:**
- Create: `tests/integration/first-login.test.ts`, `tests/integration/setup.ts`
- Modify: `vitest.config.ts` (separate unit/integration projects)

- [ ] **Step 1: Restructure vitest config**

Replace `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    projects: [
      { test: { include: ['tests/unit/**/*.test.ts'], name: 'unit' } },
      {
        test: {
          include: ['tests/integration/**/*.test.ts'],
          name: 'integration',
          setupFiles: ['tests/integration/setup.ts'],
          hookTimeout: 30000,
          testTimeout: 30000,
        },
      },
    ],
  },
})
```

Add to `package.json` scripts:
```json
"test:int": "vitest run --project integration",
"test:unit": "vitest run --project unit"
```

- [ ] **Step 2: Integration setup — reset DB before each file**

Create `tests/integration/setup.ts`:
```ts
import { execSync } from 'node:child_process'
import { beforeAll } from 'vitest'

beforeAll(() => {
  // Apply migrations + seed cleanly. Assumes `supabase start` already running.
  // `supabase db reset` automatically runs migrations then `supabase/seed.sql`.
  execSync('supabase db reset', { stdio: 'inherit' })
})
```

- [ ] **Step 3: Write failing test**

Create `tests/integration/first-login.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? (() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY not set — copy it from `supabase status` into your shell env') })()

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('first login bootstraps admin', () => {
  it('creates an auth user and a usuarios row with role=admin when no admin exists', async () => {
    const db = admin()

    // Create the auth user
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: `test-${Date.now()}@iagentics.test`,
      email_confirm: true,
    })
    expect(createErr).toBeNull()
    const userId = created.user!.id

    // Simulate callback bootstrap
    const { count: adminCountBefore } = await db
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
    const shouldBeAdmin = (adminCountBefore ?? 0) === 0

    await db.from('usuarios').upsert(
      { id: userId, nome: 'Test', role: shouldBeAdmin ? 'admin' : 'leitura' },
      { onConflict: 'id', ignoreDuplicates: true },
    )

    const { data: row } = await db.from('usuarios').select('role').eq('id', userId).single()
    expect(row?.role).toBe('admin')

    // Second user should be 'leitura'
    const { data: created2 } = await db.auth.admin.createUser({
      email: `test2-${Date.now()}@iagentics.test`,
      email_confirm: true,
    })
    const userId2 = created2.user!.id
    const { count: adminCountNow } = await db
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
    const shouldBeAdmin2 = (adminCountNow ?? 0) === 0
    await db.from('usuarios').upsert(
      { id: userId2, nome: 'Test2', role: shouldBeAdmin2 ? 'admin' : 'leitura' },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    const { data: row2 } = await db.from('usuarios').select('role').eq('id', userId2).single()
    expect(row2?.role).toBe('leitura')
  })
})
```

- [ ] **Step 4: Run test**

```bash
export SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2- | tr -d '"')
npm run test:int
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(integration): first-login bootstraps admin role"
```

---

### Task 19: Playwright E2E — login flow

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/login.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Config**

Create `playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
```

Add to `package.json` scripts:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 3: E2E test**

Create `tests/e2e/login.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('unauthenticated user is redirected to /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByText(/Entrar — IAgentics Finanças/)).toBeVisible()
})

test('submitting email shows confirmation message', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('e2e@iagentics.test')
  await page.getByRole('button', { name: /Enviar link de acesso/ }).click()
  await expect(page.getByText(/Link de acesso enviado para/)).toBeVisible({ timeout: 10_000 })
})
```

- [ ] **Step 4: Run**

```bash
npm run test:e2e
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(e2e): playwright login flow"
```

---

### Task 20: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint-typecheck-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run test:unit

  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase start
      - run: npm ci
      - name: Export service role key
        run: |
          KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2- | tr -d '"')
          echo "SUPABASE_SERVICE_ROLE_KEY=$KEY" >> $GITHUB_ENV
      - run: npm run test:int
      - if: always()
        run: supabase stop --no-backup

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase start
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Write env
        run: |
          echo "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321" >> .env.local
          ANON=$(supabase status -o env | grep -E 'ANON_KEY' | cut -d= -f2- | tr -d '"')
          SVC=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2- | tr -d '"')
          echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON" >> .env.local
          echo "SUPABASE_SERVICE_ROLE_KEY=$SVC" >> .env.local
          echo "NEXT_PUBLIC_APP_URL=http://localhost:3000" >> .env.local
      - run: npm run test:e2e
      - if: always()
        run: supabase stop --no-backup
```

- [ ] **Step 2: Commit**

```bash
git add .github
git commit -m "ci: lint + typecheck + unit + integration + e2e on PR"
```

---

### Task 21: README with setup instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# IAgentics — Gestão Financeira

Sistema interno de gestão financeira da IAgentics. Stack: Next.js 15 + Supabase.

## Pré-requisitos

- Node 20+
- Docker Desktop (rodando)
- Supabase CLI (`npm i -g supabase`)

## Setup

```bash
# 1. Subir Supabase local
supabase start

# 2. Copiar credenciais do output acima e popular .env.local
cp .env.example .env.local
# edite .env.local com NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY

# 3. Instalar deps + aplicar migrações
npm install
supabase db reset

# 4. Rodar dev
npm run dev
```

App em http://localhost:3000. Mailbox local em http://127.0.0.1:54324 (Mailpit — captura magic links).

**Primeiro login:** o primeiro usuário criado vira `admin` automaticamente; subsequentes nascem `leitura` (admin promove via tabela `usuarios`).

## Testes

```bash
npm run test:unit          # vitest unit
npm run test:int           # vitest integration (precisa supabase start)
npm run test:e2e           # playwright
```

## Estrutura

Ver [docs/superpowers/specs/2026-05-27-sistema-financeiro-iagentics-design.md](docs/superpowers/specs/2026-05-27-sistema-financeiro-iagentics-design.md).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with setup instructions"
```

---

### Task 22: Verification & phase wrap-up

- [ ] **Step 1: Full test suite locally**

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
npm run test:int
npm run test:e2e
```
Expected: all green.

- [ ] **Step 2: Manual acceptance smoke test**

```bash
npm run dev
```

Verify:
1. http://localhost:3000 → redirect to `/login`
2. Submit your real email, grab link from Mailpit (http://127.0.0.1:54324), click
3. Lands on `/` showing your email and role `admin`
4. Sidebar renders with all 10 nav links
5. Clicking any non-`/` link → 404 (expected; future phases)
6. Logout (manual: `supabase.auth.signOut()` from devtools console or clear cookies)
7. Re-access `/` → redirect to `/login`

- [ ] **Step 3: Phase wrap commit (no-op if no changes)**

If any docs/comments needed updating from the smoke test, commit. Otherwise:

```bash
git log --oneline | head -25
```
Confirm the 21 commits are present. This phase is complete.

- [ ] **Step 4: Create PR**

```bash
git checkout -b phase-0-foundation 2>/dev/null || git checkout phase-0-foundation
git push -u origin phase-0-foundation
gh pr create --title "Phase 0 — Foundation" --body "$(cat <<'EOF'
## Summary
- Bootstraps Next.js 15 + Supabase + magic link auth
- 4 base tables (organizacao, usuarios, audit_log, categorias, contas_bancarias) + RLS + role helpers
- Audit wrapper for sensitive mutations
- Protected layout + sidebar nav for all future modules
- Vitest unit + integration + Playwright E2E + GH Actions CI

## Acceptance
- [x] First login auto-bootstraps admin
- [x] RLS enforced on all created tables
- [x] All CI jobs green
- [x] README walks through setup

Spec: docs/superpowers/specs/2026-05-27-sistema-financeiro-iagentics-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Skip the `gh pr create` if remote isn't set up yet — phase still complete locally.)

---

## Acceptance Criteria (this phase)

- [ ] `npm run lint`, `tsc --noEmit`, `test:unit`, `test:int`, `test:e2e` all pass
- [ ] First magic link login creates `usuarios` row with `role='admin'`
- [ ] Subsequent logins create `role='leitura'`
- [ ] Protected routes redirect unauthenticated users to `/login`
- [ ] All 4 migrations apply cleanly via `supabase db reset`
- [ ] RLS verified: anon connection can read `categorias` (public-allowed), cannot write
- [ ] Audit wrapper writes a row to `audit_log` on successful mutation, skips on failure
- [ ] CI pipeline green
