# Fase 7 — Copiloto Financeiro (Managed Agent) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um copiloto financeiro conversacional (Q&A) que lê os dados via tools tipadas + SQL read-only sandboxed, simula cenários what-if, e propõe ações executadas só após confirmação humana.

**Architecture:** Loop de tool-use in-app sobre a Anthropic Messages API (read-only orchestrator). Tools de leitura executam no loop; tools de proposta capturam uma `ProposedAction` sem executar. Escrita só via write-leaf (`executarAcao`) após confirmação humana + re-check de role. SQL arbitrário roda num role Postgres dedicado read-only (`copiloto_ro`).

**Tech Stack:** Next.js 16 (route handler + Server Component + Server Action), `@anthropic-ai/sdk` (Messages API + tool use, `claude-sonnet-4-6`), `pg` (conexão read-only), Supabase, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-29-fase-7-copiloto-financeiro-design.md`

---

## File Structure

- Create: `supabase/migrations/0028_copiloto_ro.sql` — role read-only + grants na allowlist.
- Modify: `package.json` — adiciona `pg` + `@types/pg`.
- Create: `src/modules/copiloto/sql.ts` — `validarSqlReadonly` (puro) + `executarSqlReadonly` (pg).
- Create: `src/modules/copiloto/types.ts` — `Mensagem`, `ProposedAction` (+ Zod), `RespostaAgente`.
- Create: `src/modules/copiloto/tools-leitura.ts` — defs + `executarToolLeitura`.
- Create: `src/modules/copiloto/acoes.ts` — defs de proposta + `parseProposedAction` + `executarAcao`.
- Create: `src/modules/copiloto/agente.ts` — loop orquestrador `responder`.
- Create: `prompts/copiloto/SKILL.md` — system prompt.
- Create: `src/app/api/copiloto/route.ts` — POST handler (auth + responder).
- Create: `src/app/(dashboard)/copiloto/page.tsx` — page gated + server action `executarAcaoAction`.
- Create: `src/components/copiloto-chat.tsx` — client component de chat.
- Modify: `src/components/sidebar.tsx` — link para `/copiloto`.
- Tests: `tests/unit/modules/copiloto/{sql,types,agente}.test.ts`, `tests/integration/copiloto-{sql,tools,acoes}.test.ts`.

---

## Task 1: Dependência `pg` + migração `copiloto_ro`

**Files:**
- Modify: `package.json`
- Create: `supabase/migrations/0028_copiloto_ro.sql`

- [ ] **Step 1: Instalar `pg`**

Run: `npm install pg && npm install -D @types/pg`
Expected: `pg` em dependencies, `@types/pg` em devDependencies.

- [ ] **Step 2: Escrever a migração** — `supabase/migrations/0028_copiloto_ro.sql`

```sql
-- Read-only role for the copiloto SQL sandbox. The role's GRANTs are the real
-- privilege barrier; transaction read-only + statement_timeout are defense-in-depth.
do $$
begin
  if not exists (select from pg_roles where rolname = 'copiloto_ro') then
    create role copiloto_ro with login password 'copiloto_ro_dev' nosuperuser nocreatedb nocreaterole;
  end if;
end $$;

alter role copiloto_ro set default_transaction_read_only = on;
alter role copiloto_ro set statement_timeout = '5s';

grant usage on schema public to copiloto_ro;

grant select on
  public.clientes, public.contratos, public.projetos, public.milestones,
  public.contas_a_receber, public.contas_a_pagar, public.lancamentos,
  public.despesas_recorrentes, public.fornecedores, public.categorias,
  public.funcionarios, public.pj_spot, public.alocacoes_pj, public.folha,
  public.itens_folha, public.holerites, public.forecast_cenarios,
  public.forecast_projecoes, public.metricas_mensais, public.alertas,
  public.contas_bancarias, public.regras_categorizacao,
  public.sugestoes_conciliacao, public.tabelas_fiscais, public.organizacao
  to copiloto_ro;

-- Intentionally NOT granted: usuarios (auth), audit_log (audit), pluggy_items (credentials).
```

- [ ] **Step 3: Aplicar a migração**

Run: `npx supabase migration up`
Expected: aplica `0028_copiloto_ro` sem erro.

- [ ] **Step 4: Adicionar `COPILOTO_DATABASE_URL` ao `.env.local`**

Append (local dev — porta padrão do Supabase local é 54322):
```
COPILOTO_DATABASE_URL=postgresql://copiloto_ro:copiloto_ro_dev@127.0.0.1:54322/postgres
```

- [ ] **Step 5: Verificar manualmente que o role lê mas não escreve**

Run:
```bash
docker exec supabase_db_Gestao_IAgentics psql "postgresql://copiloto_ro:copiloto_ro_dev@127.0.0.1:5432/postgres" -c "select count(*) from public.contratos;"
docker exec supabase_db_Gestao_IAgentics psql "postgresql://copiloto_ro:copiloto_ro_dev@127.0.0.1:5432/postgres" -c "insert into public.alertas (tipo, severidade, titulo, mensagem) values ('caixa_baixo','info','x','y');"
```
Expected: o SELECT retorna um número; o INSERT falha com `cannot execute INSERT in a read-only transaction` ou `permission denied`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json supabase/migrations/0028_copiloto_ro.sql
git commit -m "feat(copiloto): pg dep + copiloto_ro read-only role migration"
```

---

## Task 2: Validador de SQL read-only (puro)

**Files:**
- Create: `src/modules/copiloto/sql.ts`
- Test: `tests/unit/modules/copiloto/sql.test.ts`

- [ ] **Step 1: Escrever o teste que falha** — `tests/unit/modules/copiloto/sql.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { validarSqlReadonly } from '@/modules/copiloto/sql'

describe('validarSqlReadonly', () => {
  it('aceita SELECT simples e força LIMIT', () => {
    const r = validarSqlReadonly('select * from contratos')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.sql.toLowerCase()).toContain('limit')
  })

  it('aceita WITH (CTE)', () => {
    const r = validarSqlReadonly('with x as (select 1 as n) select n from x limit 10')
    expect(r.ok).toBe(true)
  })

  it('preserva LIMIT existente', () => {
    const r = validarSqlReadonly('select 1 limit 5')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.sql).toMatch(/limit 5/i)
  })

  it('rejeita INSERT/UPDATE/DELETE/DDL', () => {
    for (const q of [
      'insert into alertas values (1)',
      'update contratos set ticket=0',
      'delete from lancamentos',
      'drop table contratos',
      'alter table contratos add column x int',
      'grant select on contratos to public',
      'truncate lancamentos',
    ]) {
      expect(validarSqlReadonly(q).ok).toBe(false)
    }
  })

  it('rejeita múltiplos statements', () => {
    expect(validarSqlReadonly('select 1; drop table contratos').ok).toBe(false)
  })

  it('rejeita string vazia', () => {
    expect(validarSqlReadonly('   ').ok).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/unit/modules/copiloto/sql.test.ts`
Expected: FAIL — `Cannot find module '@/modules/copiloto/sql'`.

- [ ] **Step 3: Implementar o validador** — `src/modules/copiloto/sql.ts` (apenas o validador por enquanto)

```ts
import 'server-only'

export type ValidacaoSql = { ok: true; sql: string } | { ok: false; erro: string }

const PALAVRAS_PROIBIDAS = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|merge|call|do)\b/i
const LIMITE_PADRAO = 500

/** Pure: valida que `raw` é um único SELECT/WITH read-only e garante LIMIT. */
export function validarSqlReadonly(raw: string): ValidacaoSql {
  let sql = raw.trim().replace(/;\s*$/, '') // remove ; final único
  if (!sql) return { ok: false, erro: 'SQL vazio' }
  if (sql.includes(';')) return { ok: false, erro: 'Múltiplos statements não permitidos' }
  if (!/^(select|with)\b/i.test(sql)) return { ok: false, erro: 'Apenas SELECT/WITH são permitidos' }
  if (PALAVRAS_PROIBIDAS.test(sql)) return { ok: false, erro: 'Palavra-chave de escrita/DDL detectada' }
  if (!/\blimit\b/i.test(sql)) sql = `${sql} limit ${LIMITE_PADRAO}`
  return { ok: true, sql }
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/unit/modules/copiloto/sql.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/copiloto/sql.ts tests/unit/modules/copiloto/sql.test.ts
git commit -m "feat(copiloto): SQL read-only validator (TDD)"
```

---

## Task 3: Executor de SQL via role read-only

**Files:**
- Modify: `src/modules/copiloto/sql.ts` (adiciona `executarSqlReadonly`)
- Test: `tests/integration/copiloto-sql.test.ts`

- [ ] **Step 1: Adicionar o executor a `src/modules/copiloto/sql.ts`** (imports no topo)

```ts
import { Pool } from 'pg'
```

```ts
let _pool: Pool | null = null
function pool(): Pool {
  if (_pool) return _pool
  const url = process.env.COPILOTO_DATABASE_URL
  if (!url) throw new Error('COPILOTO_DATABASE_URL não configurada')
  _pool = new Pool({ connectionString: url, max: 3 })
  return _pool
}

export type ResultadoSql = { colunas: string[]; linhas: Record<string, unknown>[] }

/** Executa SQL read-only (após validação) no role copiloto_ro. */
export async function executarSqlReadonly(raw: string): Promise<ResultadoSql> {
  const v = validarSqlReadonly(raw)
  if (!v.ok) throw new Error(`SQL inválido: ${v.erro}`)
  const res = await pool().query(v.sql)
  return { colunas: res.fields.map((f) => f.name), linhas: res.rows }
}
```

- [ ] **Step 2: Escrever o teste de integração** — `tests/integration/copiloto-sql.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { executarSqlReadonly } from '@/modules/copiloto/sql'

describe('executarSqlReadonly', () => {
  it('executa um SELECT e retorna colunas + linhas', async () => {
    const r = await executarSqlReadonly('select count(*)::int as n from contratos')
    expect(r.colunas).toContain('n')
    expect(typeof r.linhas[0]!.n).toBe('number')
  })

  it('rejeita escrita (role read-only bloqueia INSERT)', async () => {
    // O validador já barra DML, mas confirmamos que mesmo um SELECT que tenta
    // mutar via função seria bloqueado. Aqui validamos o caminho do validador.
    await expect(
      executarSqlReadonly("insert into alertas (tipo,severidade,titulo,mensagem) values ('caixa_baixo','info','x','y')"),
    ).rejects.toThrow(/inválido/i)
  })

  it('o role copiloto_ro nega escrita mesmo em transação direta', async () => {
    // Caminho que ignora o validador, indo direto ao pool, prova a barreira do role.
    const { Pool } = await import('pg')
    const p = new Pool({ connectionString: process.env.COPILOTO_DATABASE_URL!, max: 1 })
    await expect(
      p.query("insert into alertas (tipo,severidade,titulo,mensagem) values ('caixa_baixo','info','x','y')"),
    ).rejects.toThrow(/read-only|permission/i)
    await p.end()
  })
})
```

- [ ] **Step 3: Garantir que `COPILOTO_DATABASE_URL` está disponível nos testes de integração**

O `tests/integration/setup.ts` (corrigido na Fase 6) já carrega `.env.local`. Confirme que `COPILOTO_DATABASE_URL` está no `.env.local` (Task 1, Step 4). Sem isso, o teste falha com "não configurada".

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/integration/copiloto-sql.test.ts`
Expected: PASS (3 testes). Requer Supabase local + migração 0028.

- [ ] **Step 5: Commit**

```bash
git add src/modules/copiloto/sql.ts tests/integration/copiloto-sql.test.ts
git commit -m "feat(copiloto): executarSqlReadonly via copiloto_ro pool + integration (TDD)"
```

---

## Task 4: Tipos + `ProposedAction` (Zod)

**Files:**
- Create: `src/modules/copiloto/types.ts`
- Test: `tests/unit/modules/copiloto/types.test.ts`

- [ ] **Step 1: Escrever o teste que falha** — `tests/unit/modules/copiloto/types.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { ProposedActionSchema } from '@/modules/copiloto/types'

const driversOk = {
  novos_clientes_mes: 2, churn_pct: 1, ticket_medio_novo: 15000,
  novos_projetos_mes: 0, valor_medio_projeto: 0, duracao_projeto_meses: 1,
  crescimento_despesa_pct: 5,
}

describe('ProposedActionSchema', () => {
  it('valida salvar_cenario', () => {
    const r = ProposedActionSchema.safeParse({ tipo: 'salvar_cenario', nome: 'Contratar 2 devs', drivers: driversOk })
    expect(r.success).toBe(true)
  })

  it('valida fechar_mes', () => {
    expect(ProposedActionSchema.safeParse({ tipo: 'fechar_mes', mes_ref: '2026-04-01' }).success).toBe(true)
  })

  it('valida marcar_alertas_lidos', () => {
    expect(ProposedActionSchema.safeParse({ tipo: 'marcar_alertas_lidos', ids: [crypto.randomUUID()] }).success).toBe(true)
  })

  it('valida criar_regra', () => {
    expect(ProposedActionSchema.safeParse({ tipo: 'criar_regra', padrao: 'AWS', categoria_id: crypto.randomUUID() }).success).toBe(true)
  })

  it('rejeita tipo desconhecido', () => {
    expect(ProposedActionSchema.safeParse({ tipo: 'transferir_dinheiro', valor: 999 }).success).toBe(false)
  })

  it('rejeita params faltando', () => {
    expect(ProposedActionSchema.safeParse({ tipo: 'fechar_mes' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/unit/modules/copiloto/types.test.ts`
Expected: FAIL — `Cannot find module '@/modules/copiloto/types'`.

- [ ] **Step 3: Implementar os tipos** — `src/modules/copiloto/types.ts`

```ts
import { z } from 'zod'
import { Uuid } from '@/lib/schemas/common'
import { Drivers } from '@/lib/schemas/cenario'

export type Mensagem = { role: 'user' | 'assistant'; content: string }

export const ProposedActionSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('salvar_cenario'), nome: z.string().min(1), drivers: Drivers }),
  z.object({ tipo: z.literal('marcar_alertas_lidos'), ids: z.array(Uuid).min(1) }),
  z.object({ tipo: z.literal('fechar_mes'), mes_ref: z.string().regex(/^\d{4}-\d{2}-01$/) }),
  z.object({ tipo: z.literal('criar_regra'), padrao: z.string().min(1), categoria_id: Uuid }),
])

export type ProposedAction = z.infer<typeof ProposedActionSchema>

export type RespostaAgente = { mensagem: string; proposta?: ProposedAction }

export type ResultadoAcao = { ok: boolean; detalhe: string }
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/unit/modules/copiloto/types.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/copiloto/types.ts tests/unit/modules/copiloto/types.test.ts
git commit -m "feat(copiloto): Mensagem + ProposedAction schemas (TDD)"
```

---

## Task 5: Tools de leitura + dispatch

**Files:**
- Create: `src/modules/copiloto/tools-leitura.ts`
- Test: `tests/integration/copiloto-tools.test.ts`

- [ ] **Step 1: Implementar `tools-leitura.ts`**

```ts
import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { loadSnapshot } from '@/modules/forecast/snapshot'
import { gerarForecast } from '@/modules/forecast/engine'
import { Drivers } from '@/lib/schemas/cenario'
import { executarSqlReadonly } from './sql'

export const TOOLS_LEITURA: Anthropic.Tool[] = [
  {
    name: 'get_estado_atual',
    description: 'Estado financeiro atual: MRR, caixa, despesa mensal, AR/AP próximos 30 dias, contratos ativos.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_metricas_historico',
    description: 'Histórico de métricas mensais fechadas (MRR, receita, despesa, resultado, caixa, runway).',
    input_schema: { type: 'object', properties: { meses: { type: 'number', description: 'quantos meses recentes (default 12)' } } },
  },
  {
    name: 'simular_forecast',
    description: 'Simula projeção de 12 meses com drivers hipotéticos (what-if). Retorna projeção mensal e runway.',
    input_schema: {
      type: 'object',
      properties: {
        novos_clientes_mes: { type: 'number' }, churn_pct: { type: 'number' },
        ticket_medio_novo: { type: 'number' }, novos_projetos_mes: { type: 'number' },
        valor_medio_projeto: { type: 'number' }, duracao_projeto_meses: { type: 'number' },
        crescimento_despesa_pct: { type: 'number' },
      },
      required: ['novos_clientes_mes', 'churn_pct', 'ticket_medio_novo', 'novos_projetos_mes', 'valor_medio_projeto', 'duracao_projeto_meses', 'crescimento_despesa_pct'],
    },
  },
  {
    name: 'query_sql',
    description: 'Executa um SELECT read-only no banco para perguntas descritivas não cobertas pelas outras tools. Use nomes de tabela em snake_case (ex: contratos, lancamentos, contas_a_pagar).',
    input_schema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
  },
]

function primeiroDiaMesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function executarToolLeitura(name: string, input: unknown): Promise<unknown> {
  const admin = createServiceClient()
  switch (name) {
    case 'get_estado_atual':
      return loadSnapshot(primeiroDiaMesAtual())
    case 'get_metricas_historico': {
      const meses = (input as { meses?: number })?.meses ?? 12
      const { data } = await admin
        .from('metricas_mensais').select('*').order('mes_ref', { ascending: false }).limit(meses)
      return data ?? []
    }
    case 'simular_forecast': {
      const drivers = Drivers.parse(input)
      const snap = await loadSnapshot(primeiroDiaMesAtual())
      const proj = gerarForecast(snap, drivers, primeiroDiaMesAtual(), 12)
      return { runway_meses: proj[0]?.runway_meses ?? null, projecao: proj }
    }
    case 'query_sql':
      return executarSqlReadonly((input as { sql: string }).sql)
    default:
      throw new Error(`tool de leitura desconhecida: ${name}`)
  }
}
```

- [ ] **Step 2: Escrever o teste de integração** — `tests/integration/copiloto-tools.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { executarToolLeitura, TOOLS_LEITURA } from '@/modules/copiloto/tools-leitura'

const drivers = {
  novos_clientes_mes: 2, churn_pct: 1, ticket_medio_novo: 15000,
  novos_projetos_mes: 0, valor_medio_projeto: 0, duracao_projeto_meses: 1,
  crescimento_despesa_pct: 5,
}

describe('tools de leitura', () => {
  it('TOOLS_LEITURA tem 4 tools nomeadas', () => {
    expect(TOOLS_LEITURA.map((t) => t.name).sort()).toEqual(
      ['get_estado_atual', 'get_metricas_historico', 'query_sql', 'simular_forecast'],
    )
  })

  it('get_estado_atual retorna snapshot com mrrAtual', async () => {
    const r = (await executarToolLeitura('get_estado_atual', {})) as { mrrAtual: number }
    expect(typeof r.mrrAtual).toBe('number')
  })

  it('simular_forecast retorna projeção de 12 meses', async () => {
    const r = (await executarToolLeitura('simular_forecast', drivers)) as { projecao: unknown[] }
    expect(r.projecao.length).toBe(12)
  })

  it('query_sql retorna linhas', async () => {
    const r = (await executarToolLeitura('query_sql', { sql: 'select count(*)::int as n from contratos' })) as { linhas: { n: number }[] }
    expect(typeof r.linhas[0]!.n).toBe('number')
  })
})
```

- [ ] **Step 3: Rodar e verificar que passa**

Run: `npx vitest run tests/integration/copiloto-tools.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 4: Commit**

```bash
git add src/modules/copiloto/tools-leitura.ts tests/integration/copiloto-tools.test.ts
git commit -m "feat(copiloto): read tools (estado, historico, simular, query_sql) + integration (TDD)"
```

---

## Task 6: Tools de proposta + write-leaf `executarAcao`

**Files:**
- Create: `src/modules/copiloto/acoes.ts`
- Test: `tests/integration/copiloto-acoes.test.ts`

- [ ] **Step 1: Implementar `acoes.ts`**

```ts
import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { ProposedActionSchema, type ProposedAction, type ResultadoAcao } from './types'
import { atualizarCenario, recomputarProjecoes } from '@/modules/forecast/cenarios'
import { fecharMes } from '@/modules/metricas/fechamento'

export const ACOES_TOOLS: Anthropic.Tool[] = [
  {
    name: 'propor_salvar_cenario',
    description: 'Propõe salvar um cenário de forecast com os drivers simulados. NÃO executa — requer confirmação do usuário.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        drivers: {
          type: 'object',
          properties: {
            novos_clientes_mes: { type: 'number' }, churn_pct: { type: 'number' },
            ticket_medio_novo: { type: 'number' }, novos_projetos_mes: { type: 'number' },
            valor_medio_projeto: { type: 'number' }, duracao_projeto_meses: { type: 'number' },
            crescimento_despesa_pct: { type: 'number' },
          },
        },
      },
      required: ['nome', 'drivers'],
    },
  },
  {
    name: 'propor_marcar_alertas_lidos',
    description: 'Propõe marcar alertas como lidos. NÃO executa — requer confirmação.',
    input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
  },
  {
    name: 'propor_fechar_mes',
    description: 'Propõe fechar um mês (grava snapshot + commentary). NÃO executa — requer confirmação e role admin.',
    input_schema: { type: 'object', properties: { mes_ref: { type: 'string', description: 'primeiro dia do mês YYYY-MM-01' } }, required: ['mes_ref'] },
  },
  {
    name: 'propor_criar_regra',
    description: 'Propõe criar uma regra de categorização (padrão→categoria). NÃO executa — requer confirmação.',
    input_schema: { type: 'object', properties: { padrao: { type: 'string' }, categoria_id: { type: 'string' } }, required: ['padrao', 'categoria_id'] },
  },
]

const NOMES_ACAO = new Set(ACOES_TOOLS.map((t) => t.name))
export function isAcaoTool(name: string): boolean {
  return NOMES_ACAO.has(name)
}

/** Converte um tool_use de proposta numa ProposedAction validada (ou lança). */
export function parseProposedAction(toolName: string, input: unknown): ProposedAction {
  const map: Record<string, string> = {
    propor_salvar_cenario: 'salvar_cenario',
    propor_marcar_alertas_lidos: 'marcar_alertas_lidos',
    propor_fechar_mes: 'fechar_mes',
    propor_criar_regra: 'criar_regra',
  }
  const tipo = map[toolName]
  if (!tipo) throw new Error(`tool de proposta desconhecida: ${toolName}`)
  return ProposedActionSchema.parse({ tipo, ...(input as object) })
}

/** Write-leaf: executa uma ação confirmada. Re-checa role para ações sensíveis. */
export async function executarAcao(
  acao: ProposedAction,
  usuario: { id: string; role: string },
): Promise<ResultadoAcao> {
  const admin = createServiceClient()
  switch (acao.tipo) {
    case 'salvar_cenario': {
      // procura cenário por nome; cria se não existir, senão atualiza
      const { data: existente } = await admin
        .from('forecast_cenarios').select('id').eq('nome', acao.nome).maybeSingle()
      let id: string
      if (existente) {
        await atualizarCenario(existente.id, { drivers_json: acao.drivers })
        id = existente.id
      } else {
        const { data: novo, error } = await admin
          .from('forecast_cenarios').insert({ nome: acao.nome, drivers_json: acao.drivers, ativo: true }).select('id').single()
        if (error) throw new Error(`salvar_cenario: ${error.message}`)
        id = novo!.id
      }
      await recomputarProjecoes(id)
      return { ok: true, detalhe: `Cenário "${acao.nome}" salvo e projeções recalculadas.` }
    }
    case 'marcar_alertas_lidos': {
      const { error } = await admin
        .from('alertas').update({ lido: true, lido_em: new Date().toISOString(), lido_por: usuario.id }).in('id', acao.ids)
      if (error) throw new Error(`marcar_alertas_lidos: ${error.message}`)
      return { ok: true, detalhe: `${acao.ids.length} alerta(s) marcado(s) como lido(s).` }
    }
    case 'fechar_mes': {
      if (usuario.role !== 'admin') throw new Error('apenas admin pode fechar o mês')
      await fecharMes(acao.mes_ref, usuario.id)
      return { ok: true, detalhe: `Mês ${acao.mes_ref} fechado.` }
    }
    case 'criar_regra': {
      const { error } = await admin
        .from('regras_categorizacao').insert({ pattern: acao.padrao, categoria_id: acao.categoria_id, pattern_tipo: 'contains', campo: 'descricao', origem: 'manual' })
      if (error) throw new Error(`criar_regra: ${error.message}`)
      return { ok: true, detalhe: `Regra "${acao.padrao}" criada.` }
    }
  }
}
```

- [ ] **Step 2: Escrever o teste de integração** — `tests/integration/copiloto-acoes.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { executarAcao, parseProposedAction, isAcaoTool } from '@/modules/copiloto/acoes'

process.env.LLM_MODE = 'mock'
function admin() {
  return createClient('http://127.0.0.1:54321', process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
const adminUser = { id: '00000000-0000-0000-0000-000000000000', role: 'admin' }

describe('copiloto ações', () => {
  it('isAcaoTool reconhece tools de proposta', () => {
    expect(isAcaoTool('propor_fechar_mes')).toBe(true)
    expect(isAcaoTool('get_estado_atual')).toBe(false)
  })

  it('parseProposedAction valida e tipa', () => {
    const a = parseProposedAction('propor_fechar_mes', { mes_ref: '2026-04-01' })
    expect(a.tipo).toBe('fechar_mes')
  })

  it('marcar_alertas_lidos marca o alerta', async () => {
    const db = admin()
    const { data: al } = await db.from('alertas')
      .insert({ tipo: 'caixa_baixo', severidade: 'info', titulo: `t-${Date.now()}`, mensagem: 'm' }).select('id').single()
    const r = await executarAcao({ tipo: 'marcar_alertas_lidos', ids: [al!.id] }, adminUser)
    expect(r.ok).toBe(true)
    const { data: depois } = await db.from('alertas').select('lido').eq('id', al!.id).single()
    expect(depois!.lido).toBe(true)
  })

  it('fechar_mes exige admin', async () => {
    await expect(
      executarAcao({ tipo: 'fechar_mes', mes_ref: '2026-04-01' }, { id: 'x', role: 'financeiro' }),
    ).rejects.toThrow(/admin/i)
  })

  it('criar_regra insere a regra', async () => {
    const db = admin()
    const { data: cat } = await db.from('categorias').select('id').limit(1).single()
    const r = await executarAcao({ tipo: 'criar_regra', padrao: `AWS-${Date.now()}`, categoria_id: cat!.id }, adminUser)
    expect(r.ok).toBe(true)
  })
})
```

> Nota: o teste de `criar_regra` assume que existe ao menos uma categoria semeada. Se `select('id').limit(1).single()` falhar por tabela vazia, semeie uma categoria primeiro: `await db.from('categorias').insert({ nome: 'Cloud', tipo: 'despesa' }).select('id').single()` — confira as colunas obrigatórias de `categorias` na migração e ajuste.

- [ ] **Step 3: Rodar e verificar que passa**

Run: `npx vitest run tests/integration/copiloto-acoes.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 4: Commit**

```bash
git add src/modules/copiloto/acoes.ts tests/integration/copiloto-acoes.test.ts
git commit -m "feat(copiloto): proposal tools + executarAcao write-leaf + integration (TDD)"
```

---

## Task 7: Prompt `prompts/copiloto/SKILL.md`

**Files:**
- Create: `prompts/copiloto/SKILL.md`

- [ ] **Step 1: Criar o arquivo**

```markdown
---
name: copiloto-financeiro
description: Copiloto conversacional de análise financeira da IAgentics (read-only orchestrator + write-only leaf)
model: claude-sonnet-4-6
---

# Papel

Você é o copiloto financeiro interno da IAgentics. Responde perguntas do founder sobre os
dados financeiros, simula cenários, e propõe ações — sempre em PT-BR, direto e quantitativo.

# Tools

**Leitura (use livremente):**
- `get_estado_atual` — MRR, caixa, burn, runway, AR/AP, contratos. Para "como estamos agora".
- `get_metricas_historico` — métricas mensais fechadas. Para tendências e comparações.
- `simular_forecast` — projeção 12m com drivers hipotéticos. Para what-if ("e se contratar 2 devs?").
- `query_sql` — SELECT read-only para perguntas descritivas não cobertas acima. Tabelas em
  snake_case (contratos, lancamentos, contas_a_pagar, contas_a_receber, fornecedores, etc).

**Proposta (NÃO executam — só registram intenção para o usuário confirmar):**
- `propor_salvar_cenario`, `propor_marcar_alertas_lidos`, `propor_fechar_mes`, `propor_criar_regra`.

# Regras

- NUNCA invente números. Use apenas resultados de tools. Se não sabe, rode uma tool ou diga que não sabe.
- Ao simular, deixe explícito que é hipótese e cite os drivers usados.
- Ao propor uma ação, explique o efeito e diga que precisa de confirmação. NUNCA afirme que
  executou algo — a execução acontece só após o usuário confirmar.
- Prefira tools tipadas a `query_sql` quando ambas servem.
- Seja conciso. Mostre os números que embasam a resposta.
```

- [ ] **Step 2: Commit**

```bash
git add prompts/copiloto/SKILL.md
git commit -m "docs(prompts): copiloto financeiro system prompt"
```

---

## Task 8: Loop orquestrador `agente.ts`

**Files:**
- Create: `src/modules/copiloto/agente.ts`
- Test: `tests/unit/modules/copiloto/agente.test.ts`

- [ ] **Step 1: Escrever o teste que falha** — `tests/unit/modules/copiloto/agente.test.ts`

Usa injeção de dependência (`chamarModelo` fake) para testar o loop sem rede.

```ts
import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { responder } from '@/modules/copiloto/agente'

function msgTexto(text: string): Anthropic.Message {
  return { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } as never, content: [{ type: 'text', text }] } as Anthropic.Message
}
function msgToolUse(name: string, input: unknown, id = 'tu1'): Anthropic.Message {
  return { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } as never, content: [{ type: 'tool_use', id, name, input }] } as Anthropic.Message
}

describe('responder (loop com chamarModelo injetado)', () => {
  it('retorna texto quando o modelo não pede tool', async () => {
    const r = await responder([{ role: 'user', content: 'oi' }], { chamarModelo: async () => msgTexto('Olá!') })
    expect(r.mensagem).toBe('Olá!')
    expect(r.proposta).toBeUndefined()
  })

  it('executa tool de leitura e depois retorna texto', async () => {
    let call = 0
    const r = await responder([{ role: 'user', content: 'qual o estado?' }], {
      chamarModelo: async () => {
        call++
        return call === 1 ? msgToolUse('get_estado_atual', {}) : msgTexto('Seu MRR está estável.')
      },
    })
    expect(call).toBe(2)
    expect(r.mensagem).toContain('MRR')
  })

  it('captura proposta sem executar', async () => {
    const r = await responder([{ role: 'user', content: 'feche abril' }], {
      chamarModelo: async () => msgToolUse('propor_fechar_mes', { mes_ref: '2026-04-01' }),
    })
    expect(r.proposta).toEqual({ tipo: 'fechar_mes', mes_ref: '2026-04-01' })
  })
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/unit/modules/copiloto/agente.test.ts`
Expected: FAIL — `Cannot find module '@/modules/copiloto/agente'`.

- [ ] **Step 3: Implementar `agente.ts`**

```ts
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Mensagem, RespostaAgente } from './types'
import { TOOLS_LEITURA, executarToolLeitura } from './tools-leitura'
import { ACOES_TOOLS, isAcaoTool, parseProposedAction } from './acoes'

const MODELO = 'claude-sonnet-4-6'
const MAX_ITER = 8

export type ChamarModelo = (params: {
  system: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]
  messages: Anthropic.MessageParam[]
  tools: Anthropic.Tool[]
}) => Promise<Anthropic.Message>

let _client: Anthropic | null = null
function clientChamarModelo(): ChamarModelo {
  return async (params) => {
    if (!_client) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required when LLM_MODE=real')
      _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    }
    return _client.messages.create({ model: MODELO, max_tokens: 1500, ...params })
  }
}

async function systemPrompt(): Promise<string> {
  return readFile(path.join(process.cwd(), 'prompts', 'copiloto', 'SKILL.md'), 'utf-8')
}

function textoDe(m: Anthropic.Message): string {
  return m.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim()
}

/**
 * Loop read-only orchestrator. Executa tools de leitura até o modelo responder em texto
 * ou pedir uma tool de proposta (que é capturada sem executar).
 * `opts.chamarModelo` permite injeção em testes; em produção usa a Messages API.
 */
export async function responder(
  historico: Mensagem[],
  opts: { chamarModelo?: ChamarModelo } = {},
): Promise<RespostaAgente> {
  const chamar = opts.chamarModelo ?? (process.env.LLM_MODE === 'real' ? clientChamarModelo() : mockChamarModelo)
  const sys = await systemPrompt().catch(() => 'Copiloto financeiro IAgentics.')
  const tools = [...TOOLS_LEITURA, ...ACOES_TOOLS]
  const messages: Anthropic.MessageParam[] = historico.map((m) => ({ role: m.role, content: m.content }))

  for (let i = 0; i < MAX_ITER; i++) {
    const resp = await chamar({
      system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
      messages,
      tools,
    })
    if (resp.stop_reason !== 'tool_use') return { mensagem: textoDe(resp) }

    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const proposta = toolUses.find((t) => isAcaoTool(t.name))
    if (proposta) {
      return { mensagem: textoDe(resp), proposta: parseProposedAction(proposta.name, proposta.input) }
    }

    messages.push({ role: 'assistant', content: resp.content })
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (t) => ({
        type: 'tool_result' as const,
        tool_use_id: t.id,
        content: JSON.stringify(await executarToolLeitura(t.name, t.input)),
      })),
    )
    messages.push({ role: 'user', content: results })
  }
  return { mensagem: 'Não consegui concluir dentro do limite de passos. Reformule a pergunta?' }
}

// Mock determinístico para LLM_MODE != real (sem rede). Heurística simples por palavra-chave.
const mockChamarModelo: ChamarModelo = async ({ messages }) => {
  const ultima = [...messages].reverse().find((m) => m.role === 'user')
  const txt = typeof ultima?.content === 'string' ? ultima.content.toLowerCase() : ''
  if (txt.includes('fech') && txt.includes('mes')) {
    return { id: 'm', type: 'message', role: 'assistant', model: 'mock', stop_reason: 'tool_use', stop_sequence: null, usage: {} as never,
      content: [{ type: 'tool_use', id: 'tu', name: 'propor_fechar_mes', input: { mes_ref: '2026-04-01' } }] } as Anthropic.Message
  }
  return { id: 'm', type: 'message', role: 'assistant', model: 'mock', stop_reason: 'end_turn', stop_sequence: null, usage: {} as never,
    content: [{ type: 'text', text: 'Mock: posso analisar estado atual, histórico, simular cenários e propor ações.' }] } as Anthropic.Message
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/unit/modules/copiloto/agente.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/modules/copiloto/agente.ts tests/unit/modules/copiloto/agente.test.ts
git commit -m "feat(copiloto): orchestrator loop responder + mock mode (TDD)"
```

---

## Task 9: Route handler `POST /api/copiloto`

**Files:**
- Create: `src/app/api/copiloto/route.ts`

- [ ] **Step 1: Implementar o route handler**

Segue o padrão de auth dos outros endpoints, mas usa o client por cookies (sessão do usuário) em vez de `CRON_SECRET`, e checa role.

```ts
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { responder } from '@/modules/copiloto/agente'
import type { Mensagem } from '@/modules/copiloto/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: usuario } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (!usuario || !['admin', 'financeiro'].includes(usuario.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await request.json()) as { historico?: Mensagem[] }
  const historico = (body.historico ?? []).slice(-20) // limita o contexto
  if (historico.length === 0) return NextResponse.json({ error: 'histórico vazio' }, { status: 400 })

  const resposta = await responder(historico)
  return NextResponse.json(resposta)
}
```

- [ ] **Step 2: Verificar typecheck + build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui; rota `/api/copiloto` aparece como dynamic.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/copiloto/route.ts
git commit -m "feat(copiloto): POST /api/copiloto route (auth + role gate)"
```

---

## Task 10: UI — página `/copiloto`, chat e confirmação

**Files:**
- Create: `src/app/(dashboard)/copiloto/page.tsx`
- Create: `src/components/copiloto-chat.tsx`
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Implementar a página (Server Component + Server Action)** — `src/app/(dashboard)/copiloto/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CopilotoChat } from '@/components/copiloto-chat'
import type { ProposedAction } from '@/modules/copiloto/types'

export default async function CopilotoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: usuario } = await supabase.from('usuarios').select('role').eq('id', user!.id).single()
  if (!usuario || !['admin', 'financeiro'].includes(usuario.role)) redirect('/')

  async function executarAcaoAction(acao: ProposedAction): Promise<{ ok: boolean; detalhe: string }> {
    'use server'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) throw new Error('not authenticated')
    const { data: me } = await sb.from('usuarios').select('role').eq('id', u.id).single()
    if (!me) throw new Error('forbidden')
    const { executarAcao } = await import('@/modules/copiloto/acoes')
    return executarAcao(acao, { id: u.id, role: me.role })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Copiloto Financeiro</h1>
      <p className="text-sm text-neutral-500">Pergunte sobre MRR, runway, despesas, simule cenários ou peça ações (com confirmação).</p>
      <CopilotoChat executarAcao={executarAcaoAction} />
    </div>
  )
}
```

- [ ] **Step 2: Implementar o chat client** — `src/components/copiloto-chat.tsx`

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Mensagem, ProposedAction, RespostaAgente } from '@/modules/copiloto/types'

type Props = { executarAcao: (acao: ProposedAction) => Promise<{ ok: boolean; detalhe: string }> }

export function CopilotoChat({ executarAcao }: Props) {
  const [historico, setHistorico] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [proposta, setProposta] = useState<ProposedAction | null>(null)

  async function enviar() {
    if (!input.trim() || carregando) return
    const novo: Mensagem[] = [...historico, { role: 'user', content: input.trim() }]
    setHistorico(novo); setInput(''); setCarregando(true); setProposta(null)
    try {
      const resp = await fetch('/api/copiloto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ historico: novo }) })
      const data = (await resp.json()) as RespostaAgente
      setHistorico((h) => [...h, { role: 'assistant', content: data.mensagem }])
      if (data.proposta) setProposta(data.proposta)
    } finally {
      setCarregando(false)
    }
  }

  async function confirmar() {
    if (!proposta) return
    setCarregando(true)
    try {
      const r = await executarAcao(proposta)
      setHistorico((h) => [...h, { role: 'assistant', content: `✅ ${r.detalhe}` }])
      setProposta(null)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {historico.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <span className={`inline-block rounded-md px-3 py-2 text-sm ${m.role === 'user' ? 'bg-blue-50' : 'bg-neutral-100'}`}>{m.content}</span>
          </div>
        ))}
      </div>

      {proposta && (
        <Card className="border-amber-300">
          <CardContent className="pt-6 space-y-3">
            <div className="text-sm">O copiloto propõe a ação <strong>{proposta.tipo}</strong>:</div>
            <pre className="text-xs bg-neutral-50 p-2 rounded overflow-auto">{JSON.stringify(proposta, null, 2)}</pre>
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmar} disabled={carregando}>Confirmar</Button>
              <Button size="sm" variant="outline" onClick={() => setProposta(null)} disabled={carregando}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-md px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
          placeholder="Pergunte algo… (ex: qual meu runway se eu contratar 2 devs a R$15k?)"
          disabled={carregando}
        />
        <Button onClick={enviar} disabled={carregando}>{carregando ? '…' : 'Enviar'}</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Adicionar link no sidebar** — `src/components/sidebar.tsx`

Leia o arquivo, encontre a lista de links de navegação e adicione um item para o Copiloto seguindo o MESMO padrão dos itens existentes (href `/copiloto`, label "Copiloto"). Posicione-o logo após o link do Dashboard/início. Replique a estrutura exata de um item existente (mesmas classes, mesmo componente de Link).

- [ ] **Step 4: Verificar typecheck + build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui; `/copiloto` aparece como rota.

- [ ] **Step 5: Smoke manual (recomendado)**

Run: `npm run dev`, abrir `/copiloto` logado como admin. Com `LLM_MODE=mock` (default), digitar "feche o mês" → deve aparecer um card de proposta `fechar_mes`; clicar Confirmar → mensagem de sucesso. Como `financeiro`, a página carrega mas `fechar_mes` é bloqueado no server.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/copiloto/page.tsx" src/components/copiloto-chat.tsx src/components/sidebar.tsx
git commit -m "feat(copiloto): /copiloto page, chat UI + confirmation card, sidebar link"
```

---

## Task 11: Verificação final + roadmap

**Files:** `README.md`

- [ ] **Step 1: Rodar a suíte completa**

Run: `npm test`
Expected: tudo verde. Novos: sql (6) + types (6) + agente (3) unit; copiloto-sql (3) + copiloto-tools (4) + copiloto-acoes (5) integration.

- [ ] **Step 2: Marcar Fase 7 no roadmap** — `README.md`

Encontre a tabela de fases e adicione/atualize a linha:
```
| 7 ✅ | Copiloto Financeiro (Managed Agent — Q&A read-only + what-if + ações confirmadas) |
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: mark Phase 7 complete in roadmap"
```

---

## Self-Review (preenchido pelo autor do plano)

- **Cobertura do spec:** §4 arquitetura → Tasks 8,9,10. §5.1 agente → Task 8. §5.2 tools leitura → Task 5. §5.3 SQL sandbox → Tasks 2,3. §5.4 write-leaf → Tasks 4,6. §6 migração role → Task 1. §7 prompt → Task 7. §8 UI → Task 10. §9 segurança → Tasks 1 (role), 6 (role re-check), 8 (cap iterações), 9/10 (gate de página/route). §10 testes → Tasks 2,3,4,5,6,8,11.
- **Consistência de tipos:** `Mensagem`/`ProposedAction`/`RespostaAgente`/`ResultadoAcao` definidos na Task 4, usados em 5,6,8,9,10. `ChamarModelo` def. na Task 8 e injetado no teste. `TOOLS_LEITURA`/`executarToolLeitura` (Task 5), `ACOES_TOOLS`/`isAcaoTool`/`parseProposedAction`/`executarAcao` (Task 6) consumidos pelo loop (Task 8). `validarSqlReadonly`/`executarSqlReadonly` (Tasks 2,3) consumidos por `query_sql` (Task 5).
- **Placeholders:** nenhum TODO/TBD em código. Dois passos pedem para "ler o arquivo e seguir o padrão": sidebar (Task 10.3, estrutura varia) e o ajuste opcional de seed de categorias (Task 6.2 nota) — ambos são adaptações guiadas a estruturas existentes, não código omitido.
- **Riscos conhecidos:** (a) colunas obrigatórias de `categorias`/`alertas` no seed dos testes de integração — instruções de ajuste incluídas; (b) `pg` conecta na porta 54322 (Supabase local) — o `psql` via `docker exec` usa 5432 (porta interna do container); ambos documentados.
