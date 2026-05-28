# IAgentics — Gestão Financeira

Sistema interno de gestão financeira da IAgentics. Stack: Next.js 16 (App Router) + Supabase (Postgres + Auth + RLS) + Claude Haiku 4.5 para tarefas de IA.

## Pré-requisitos

- Node 20+
- Docker Desktop (rodando)
- Supabase CLI (`npm i -g supabase`)

## Setup

```bash
# 1. Subir Supabase local
supabase start

# 2. Copiar credenciais e popular .env.local
cp .env.example .env.local
# edite .env.local com NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY
# (valores em `supabase status -o env`)

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
npm run test:e2e           # playwright (precisa supabase start)
```

## Estrutura

- `src/app/` — rotas Next.js (App Router)
  - `(dashboard)/` — área autenticada com sidebar
  - `login/`, `auth/callback/` — fluxo de magic link
- `src/lib/supabase/` — clients (server, browser, middleware, service-role)
- `src/lib/schemas/` — Zod schemas compartilhados
- `src/lib/audit.ts` — wrapper `withAudit()` para mutações sensíveis
- `src/components/` — componentes React (incluindo sidebar)
- `supabase/migrations/` — schema SQL versionado
- `prompts/` — biblioteca de prompts Claude versionados (padrão [`anthropics/financial-services`](https://github.com/anthropics/financial-services/tree/main/plugins/vertical-plugins))
- `tests/{unit,integration,e2e}/` — três tiers de teste

## Documentação

- Spec completo: [docs/superpowers/specs/2026-05-27-sistema-financeiro-iagentics-design.md](docs/superpowers/specs/2026-05-27-sistema-financeiro-iagentics-design.md)
- Plano Fase 0: [docs/superpowers/plans/2026-05-27-fase-0-foundation.md](docs/superpowers/plans/2026-05-27-fase-0-foundation.md)

## Roadmap por fases

| Fase | Entregável |
|---|---|
| 0 ✅ | Foundation (auth, layout, audit, CI) |
| 1 ✅ | Receitas + Contas a Receber |
| 2 | Despesas + Contas a Pagar |
| 3 | Folha de Pagamento (CLT + PJ Spot) |
| 4 | Bancos (Pluggy) + Categorização (regras + LLM) |
| 5 | Forecast + Alertas |
| 6 | Dashboard Executivo |
