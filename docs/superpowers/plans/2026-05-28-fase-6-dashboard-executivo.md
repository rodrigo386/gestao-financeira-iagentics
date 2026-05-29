# Fase 6 — Dashboard Executivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o placeholder da home por um dashboard executivo com KPIs ao vivo, tendência mensal histórica, painel de alertas e um comentário mensal gerado por IA, introduzindo a persistência de métricas mensais (fechamento manual).

**Architecture:** Nova tabela `metricas_mensais` (snapshot mensal). Novo módulo `src/modules/metricas/` com funções puras (testáveis isoladamente) para montar métricas e linhas de variância MoM, mais wrappers de I/O (`computeMetricasMes`, `fecharMes`) e o orquestrador de commentary (LLM read-only). A página dashboard é Server Component que reusa `loadSnapshot` (forecast) para os KPIs ao vivo e lê `metricas_mensais` para a tendência. Fechamento é Server Action restrita a `role = 'admin'`.

**Tech Stack:** Next.js 16 (App Router, Server Components/Actions), Supabase (Postgres + RLS), Zod, recharts, Claude Haiku 4.5 (LLM_MODE mock/real), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-28-fase-6-dashboard-executivo-design.md`

---

## File Structure

- Create: `supabase/migrations/0027_metricas_mensais.sql` — tabela + RLS.
- Create: `src/modules/metricas/snapshot.ts` — `montarMetricas` (puro) + `computeMetricasMes` (I/O) + tipo `MetricasMes`.
- Create: `src/modules/metricas/variancia.ts` — `montarLinhasVariancia` (puro) + tipo `LinhaVariancia`.
- Create: `src/modules/metricas/commentary.ts` — `gerarCommentary` (orquestra variância + LLM).
- Create: `src/modules/metricas/fechamento.ts` — `fecharMes` (upsert + commentary).
- Modify: `src/lib/llm/types.ts` — adiciona `CommentaryResult` (Zod).
- Modify: `src/lib/llm/client.ts` — adiciona `gerarCommentaryMensal` (mock + real) e estende `readSkillPrompt`.
- Modify: `prompts/commentary/SKILL.md` — preenche o stub.
- Create: `src/components/tendencia-chart.tsx` — gráfico de linha MRR + Caixa (client).
- Modify: `src/app/(dashboard)/page.tsx` — dashboard completo.
- Create: `tests/unit/modules/metricas/snapshot.test.ts`
- Create: `tests/unit/modules/metricas/variancia.test.ts`
- Create: `tests/unit/modules/metricas/commentary.test.ts`
- Create: `tests/integration/metricas-fechamento.test.ts`

---

## Task 1: Migração `metricas_mensais`

**Files:**
- Create: `supabase/migrations/0027_metricas_mensais.sql`

- [ ] **Step 1: Escrever a migração**

Espelha o padrão de `supabase/migrations/0025_forecast_projecoes.sql` (RLS: select para autenticados, modify via `can_write()`; check de dia 1).

```sql
create table public.metricas_mensais (
  id                   uuid primary key default gen_random_uuid(),
  mes_ref              date not null unique,
  mrr                  numeric(14,2) not null,
  arr                  numeric(14,2) not null,
  receita_total        numeric(14,2) not null,
  despesa_total        numeric(14,2) not null,
  resultado            numeric(14,2) not null,
  caixa_fim            numeric(14,2) not null,
  runway_meses         numeric(6,1),               -- null quando despesa=0 ou > 36
  contratos_ativos     integer not null,
  churn_rate           numeric(6,4) not null,
  commentary_resumo    text,
  commentary_destaques jsonb,
  fechado_por          uuid references public.usuarios(id),
  fechado_em           timestamptz not null default now(),
  criado_em            timestamptz not null default now(),
  constraint metricas_mes_dia_um check (extract(day from mes_ref) = 1)
);

alter table public.metricas_mensais enable row level security;

create policy "metricas_select_authenticated"
  on public.metricas_mensais for select to authenticated using (true);

create policy "metricas_modify_can_write"
  on public.metricas_mensais for all to authenticated
  using (public.can_write()) with check (public.can_write());
```

- [ ] **Step 2: Aplicar a migração no Supabase local**

Run: `npx supabase migration up`
Expected: aplica `0027_metricas_mensais` sem erro; `metricas_mensais` passa a existir.

(Se o CLI exigir reset: `npx supabase db reset` recria todas as migrações. Confirme que termina "Finished supabase db reset".)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0027_metricas_mensais.sql
git commit -m "feat(metricas): metricas_mensais table + RLS"
```

---

## Task 2: Função pura `montarMetricas` + tipo `MetricasMes`

**Files:**
- Create: `src/modules/metricas/snapshot.ts`
- Test: `tests/unit/modules/metricas/snapshot.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { montarMetricas } from '@/modules/metricas/snapshot'
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

describe('montarMetricas', () => {
  it('soma entradas e saídas do mês e calcula resultado', () => {
    const m = montarMetricas({
      mesRef: '2026-04-01',
      contratos: [contrato({ tipo: 'mensal', ticket: 5000 })],
      lancamentos: [
        { tipo: 'entrada', valor: 8000 },
        { tipo: 'entrada', valor: 2000 },
        { tipo: 'saida', valor: 6000 },
      ],
      caixaFim: 50000,
    })
    expect(m.receita_total).toBe(10000)
    expect(m.despesa_total).toBe(6000)
    expect(m.resultado).toBe(4000)
    expect(m.caixa_fim).toBe(50000)
    expect(m.mrr).toBe(5000)
    expect(m.arr).toBe(60000)
    expect(m.contratos_ativos).toBe(1)
  })

  it('runway = caixa_fim / despesa_total arredondado a 1 casa', () => {
    const m = montarMetricas({
      mesRef: '2026-04-01', contratos: [],
      lancamentos: [{ tipo: 'saida', valor: 10000 }], caixaFim: 35000,
    })
    expect(m.runway_meses).toBe(3.5)
  })

  it('runway null quando despesa_total = 0', () => {
    const m = montarMetricas({ mesRef: '2026-04-01', contratos: [], lancamentos: [], caixaFim: 1000 })
    expect(m.runway_meses).toBeNull()
  })

  it('runway null quando quociente > 36', () => {
    const m = montarMetricas({
      mesRef: '2026-04-01', contratos: [],
      lancamentos: [{ tipo: 'saida', valor: 100 }], caixaFim: 100000,
    })
    expect(m.runway_meses).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `npx vitest run tests/unit/modules/metricas/snapshot.test.ts`
Expected: FAIL — `Cannot find module '@/modules/metricas/snapshot'`.

- [ ] **Step 3: Implementar `montarMetricas` + `MetricasMes`**

```ts
import 'server-only'
import type { Contrato } from '@/lib/schemas/contrato'
import { calcularMRR, calcularARR, calcularChurnRate } from '@/modules/receitas/metricas'

export type MetricasMes = {
  mes_ref: string
  mrr: number
  arr: number
  receita_total: number
  despesa_total: number
  resultado: number
  caixa_fim: number
  runway_meses: number | null
  contratos_ativos: number
  churn_rate: number
}

type MontarInput = {
  mesRef: string
  contratos: Contrato[]
  lancamentos: { tipo: 'entrada' | 'saida'; valor: number }[]
  caixaFim: number
}

/** Pure: monta as métricas realizadas de um mês a partir de linhas já carregadas. */
export function montarMetricas(input: MontarInput): MetricasMes {
  const fimMes = lastDayOfMonth(input.mesRef)
  const receita_total = round2(sumByTipo(input.lancamentos, 'entrada'))
  const despesa_total = round2(sumByTipo(input.lancamentos, 'saida'))
  const resultado = round2(receita_total - despesa_total)
  const caixa_fim = round2(input.caixaFim)

  let runway_meses: number | null = null
  if (despesa_total > 0) {
    const q = caixa_fim / despesa_total
    runway_meses = q > 36 ? null : Math.round(q * 10) / 10
  }

  return {
    mes_ref: input.mesRef,
    mrr: round2(calcularMRR(input.contratos, fimMes)),
    arr: round2(calcularARR(input.contratos, fimMes)),
    receita_total,
    despesa_total,
    resultado,
    caixa_fim,
    runway_meses,
    contratos_ativos: input.contratos.filter((c) => isAtivoNaData(c, fimMes)).length,
    churn_rate: round4(calcularChurnRate(input.contratos, input.mesRef)),
  }
}

function sumByTipo(rows: { tipo: 'entrada' | 'saida'; valor: number }[], tipo: 'entrada' | 'saida'): number {
  return rows.filter((r) => r.tipo === tipo).reduce((s, r) => s + r.valor, 0)
}

function isAtivoNaData(c: Contrato, refDate: string): boolean {
  if (c.status !== 'ativo') return false
  if (c.data_inicio > refDate) return false
  if (c.data_fim && c.data_fim < refDate) return false
  return true
}

function lastDayOfMonth(mesRef: string): string {
  const [y, m] = mesRef.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m!, 0)) // day 0 of next month = last day of this month
  return d.toISOString().slice(0, 10)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
```

- [ ] **Step 4: Rodar o teste e verificar que passa**

Run: `npx vitest run tests/unit/modules/metricas/snapshot.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/metricas/snapshot.ts tests/unit/modules/metricas/snapshot.test.ts
git commit -m "feat(metricas): montarMetricas pure fn + MetricasMes (TDD)"
```

---

## Task 3: Função pura `montarLinhasVariancia` (MoM + materialidade)

**Files:**
- Create: `src/modules/metricas/variancia.ts`
- Test: `tests/unit/modules/metricas/variancia.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { montarLinhasVariancia } from '@/modules/metricas/variancia'
import type { MetricasMes } from '@/modules/metricas/snapshot'

function mm(p: Partial<MetricasMes>): MetricasMes {
  return {
    mes_ref: '2026-04-01', mrr: 0, arr: 0, receita_total: 0, despesa_total: 0,
    resultado: 0, caixa_fim: 0, runway_meses: null, contratos_ativos: 0, churn_rate: 0, ...p,
  }
}

describe('montarLinhasVariancia', () => {
  it('calcula delta e delta_pct por linha', () => {
    const linhas = montarLinhasVariancia(mm({ mrr: 12000 }), mm({ mrr: 10000 }))
    const mrr = linhas.find((l) => l.linha === 'mrr')!
    expect(mrr.delta).toBe(2000)
    expect(mrr.delta_pct).toBeCloseTo(20)
    expect(mrr.material).toBe(true)
  })

  it('material exige |delta| >= max(5% do anterior, R$50)', () => {
    // 5% de 10000 = 500; delta 100 < 500 → não material
    const linhas = montarLinhasVariancia(mm({ mrr: 10100 }), mm({ mrr: 10000 }))
    expect(linhas.find((l) => l.linha === 'mrr')!.material).toBe(false)
    // delta 60 com anterior pequeno (200): 5% = 10, abs = 50 → max 50; 60 >= 50 → material
    const linhas2 = montarLinhasVariancia(mm({ receita_total: 260 }), mm({ receita_total: 200 }))
    expect(linhas2.find((l) => l.linha === 'receita_total')!.material).toBe(true)
  })

  it('delta_pct null quando anterior = 0', () => {
    const linhas = montarLinhasVariancia(mm({ despesa_total: 500 }), mm({ despesa_total: 0 }))
    const d = linhas.find((l) => l.linha === 'despesa_total')!
    expect(d.delta_pct).toBeNull()
    expect(d.material).toBe(true) // 500 >= max(50, 0)
  })

  it('cobre as 5 linhas', () => {
    const linhas = montarLinhasVariancia(mm({}), mm({}))
    expect(linhas.map((l) => l.linha).sort()).toEqual(
      ['caixa_fim', 'despesa_total', 'mrr', 'receita_total', 'resultado'],
    )
  })
})
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `npx vitest run tests/unit/modules/metricas/variancia.test.ts`
Expected: FAIL — `Cannot find module '@/modules/metricas/variancia'`.

- [ ] **Step 3: Implementar `montarLinhasVariancia`**

```ts
import 'server-only'
import type { MetricasMes } from './snapshot'

export type LinhaKey = 'mrr' | 'receita_total' | 'despesa_total' | 'caixa_fim' | 'resultado'

export type LinhaVariancia = {
  linha: LinhaKey
  atual: number
  anterior: number
  delta: number
  delta_pct: number | null
  material: boolean
}

export type Thresholds = { pct: number; abs: number }

const LINHAS: LinhaKey[] = ['mrr', 'receita_total', 'despesa_total', 'caixa_fim', 'resultado']

const DEFAULT_THRESHOLDS: Thresholds = { pct: 5, abs: 50 }

/** Pure: variância mês-a-mês por linha, com flag de materialidade max(pct% do anterior, abs). */
export function montarLinhasVariancia(
  atual: MetricasMes,
  anterior: MetricasMes,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): LinhaVariancia[] {
  return LINHAS.map((linha) => {
    const a = atual[linha] as number
    const b = anterior[linha] as number
    const delta = round2(a - b)
    const delta_pct = b === 0 ? null : round2((delta / Math.abs(b)) * 100)
    const limite = Math.max(thresholds.abs, (thresholds.pct / 100) * Math.abs(b))
    return { linha, atual: a, anterior: b, delta, delta_pct, material: Math.abs(delta) >= limite }
  })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
```

- [ ] **Step 4: Rodar o teste e verificar que passa**

Run: `npx vitest run tests/unit/modules/metricas/variancia.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/metricas/variancia.ts tests/unit/modules/metricas/variancia.test.ts
git commit -m "feat(metricas): montarLinhasVariancia MoM + materiality (TDD)"
```

---

## Task 4: `CommentaryResult` (Zod) + `gerarCommentaryMensal` no LLM client

**Files:**
- Modify: `src/lib/llm/types.ts`
- Modify: `src/lib/llm/client.ts`

- [ ] **Step 1: Adicionar o schema `CommentaryResult` em `types.ts`**

Adicionar ao final de `src/lib/llm/types.ts`:

```ts
export const CommentaryResult = z.object({
  resumo: z.string().min(1).max(2000),
  destaques: z.array(
    z.object({
      linha: z.string(),
      driver: z.string(),
      magnitude: z.string(),
    }),
  ),
})

export type CommentaryResult = z.infer<typeof CommentaryResult>
```

- [ ] **Step 2: Estender `readSkillPrompt` e adicionar `gerarCommentaryMensal` em `client.ts`**

Em `src/lib/llm/client.ts`:

(a) atualizar o import de tipos:
```ts
import { CategoriaSuggestion, BreakClassification, CommentaryResult } from './types'
```

(b) ampliar a assinatura de `readSkillPrompt`:
```ts
async function readSkillPrompt(name: 'categorizacao' | 'reconciliacao' | 'commentary'): Promise<string> {
  const p = path.join(process.cwd(), 'prompts', name, 'SKILL.md')
  return readFile(p, 'utf-8')
}
```

(c) adicionar o tipo de input e as funções (após `classifyBreak`):
```ts
type CommentaryInput = {
  mes_ref: string
  linhas: { linha: string; atual: number; anterior: number; delta: number; delta_pct: number | null }[]
  thresholds: { pct: number; abs: number }
}

export async function gerarCommentaryMensal(input: CommentaryInput): Promise<CommentaryResult> {
  if (process.env.LLM_MODE !== 'real') {
    return mockCommentary(input)
  }
  return realCommentary(input)
}

function mockCommentary(input: CommentaryInput): CommentaryResult {
  const destaques = input.linhas.map((l) => {
    const dir = l.delta >= 0 ? 'aumento' : 'queda'
    const pct = l.delta_pct === null ? 's/ base' : `${Math.abs(l.delta_pct).toFixed(1)}%`
    return {
      linha: l.linha,
      driver: `Mock: ${dir} de R$ ${Math.abs(l.delta).toLocaleString('pt-BR')} (${pct}) vs. mês anterior`,
      magnitude: `R$ ${l.delta.toLocaleString('pt-BR')}`,
    }
  })
  const resumo = destaques.length
    ? `Mock: ${destaques.length} variação(ões) material(is) no mês ${input.mes_ref}. ` +
      destaques.map((d) => d.driver).join(' ')
    : `Mock: sem variações materiais em ${input.mes_ref}.`
  return { resumo, destaques }
}

async function realCommentary(input: CommentaryInput): Promise<CommentaryResult> {
  const sys = await readSkillPrompt('commentary')
  const client = getClient()

  const linhasTxt = input.linhas
    .map((l) => {
      const pct = l.delta_pct === null ? 's/ base' : `${l.delta_pct.toFixed(1)}%`
      return `- ${l.linha}: atual R$ ${l.atual.toFixed(2)} | anterior R$ ${l.anterior.toFixed(2)} | Δ R$ ${l.delta.toFixed(2)} (${pct})`
    })
    .join('\n')

  const userText = `
Mês de referência: ${input.mes_ref}
Materialidade: max(${input.thresholds.pct}% da categoria, R$ ${input.thresholds.abs})

Linhas de variância (mês-a-mês, já filtradas por materialidade):
${linhasTxt || '(nenhuma linha material)'}

Retorne APENAS um JSON com {"resumo": "<3-5 sentenças PT-BR>", "destaques": [{"linha": "<nome>", "driver": "<explicação do driver>", "magnitude": "<valor>"}]}.
`.trim()

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userText }],
  })

  const text = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
  const parsed = extractJSON(text)
  return CommentaryResult.parse(parsed)
}
```

- [ ] **Step 3: Smoke test do mock via vitest inline**

Run: `npx vitest run tests/unit/lib/llm/client.test.ts`
Expected: PASS (testes existentes continuam verdes; nada quebrou com o import novo).

- [ ] **Step 4: Commit**

```bash
git add src/lib/llm/types.ts src/lib/llm/client.ts
git commit -m "feat(llm): gerarCommentaryMensal (mock + real) + CommentaryResult schema"
```

---

## Task 5: Preencher o prompt `prompts/commentary/SKILL.md`

**Files:**
- Modify: `prompts/commentary/SKILL.md`

- [ ] **Step 1: Reescrever o corpo do SKILL.md**

Manter o frontmatter existente (name/description/model/inputs/outputs) e preencher as seções. Foco nos três eixos de sobrevivência (D2): crescimento de MRR MoM %, burn líquido, Δ runway.

```markdown
# Objetivo

Gerar um comentário executivo curto (3-5 sentenças, PT-BR) explicando as variações
mês-a-mês relevantes das métricas financeiras da IAgentics, enquadrado nos três eixos de
sobrevivência de uma startup: crescimento de MRR (MoM %), burn líquido (despesa − receita)
e variação de runway. Explicar o **driver** de cada variação material — não apenas
restituir o percentual.

# Inputs

- `mes_ref` (date): mês fechado.
- `linhas_variancia` (array): linhas MoM já filtradas por materialidade. Cada item tem
  `{linha, atual, anterior, delta, delta_pct}` para mrr, receita_total, despesa_total,
  caixa_fim, resultado.
- `thresholds` (object): `{pct: 5, abs: 50}` — materialidade = max(5% da categoria, R$ 50).

# Procedimento

1. Considerar apenas as linhas recebidas (já são as materiais).
2. Priorizar as maiores magnitudes e tudo que afeta runway/caixa.
3. Para cada linha relevante, descrever o driver provável da variação (ex: novo contrato,
   churn, folha de 13º, despesa pontual) sem inventar números fora do input.
4. Resumir em 3-5 sentenças, começando pelo eixo mais crítico (runway/burn quando piora).

# Outputs

JSON: `{"resumo": "<3-5 sentenças PT-BR>", "destaques": [{"linha": "<nome>",
"driver": "<explicação>", "magnitude": "<valor R$>"}]}`.

# Restrições

- Limite 1 chamada/mês (após fechamento) — não ad-hoc.
- Sempre em PT-BR.
- Nunca inventar números — usar apenas os dados de entrada.

# Exemplos

**Input (resumido):** mrr Δ +R$ 8.000 (+12,5%); despesa_total Δ +R$ 12.000 (+18%);
caixa_fim Δ −R$ 4.000.

**Output:**
```json
{
  "resumo": "O MRR cresceu R$ 8.000 (+12,5%) no mês, provavelmente por novo contrato recorrente, mantendo a tração de receita. A despesa subiu R$ 12.000 (+18%), o principal ofensor do mês — compatível com folha de 13º ou gasto pontual. Como a despesa cresceu mais que a receita, o caixa caiu R$ 4.000, pressionando levemente o runway. Vale confirmar se o aumento de despesa é recorrente ou pontual antes de revisar o forecast.",
  "destaques": [
    {"linha": "mrr", "driver": "Novo contrato recorrente", "magnitude": "R$ 8.000"},
    {"linha": "despesa_total", "driver": "Folha de 13º / gasto pontual", "magnitude": "R$ 12.000"}
  ]
}
```
```

- [ ] **Step 2: Commit**

```bash
git add prompts/commentary/SKILL.md
git commit -m "docs(prompts): fill commentary SKILL with survival-metric framing"
```

---

## Task 6: `gerarCommentary` (orquestrador do módulo)

**Files:**
- Create: `src/modules/metricas/commentary.ts`
- Test: `tests/unit/modules/metricas/commentary.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { MetricasMes } from '@/modules/metricas/snapshot'

function mm(p: Partial<MetricasMes>): MetricasMes {
  return {
    mes_ref: '2026-04-01', mrr: 0, arr: 0, receita_total: 0, despesa_total: 0,
    resultado: 0, caixa_fim: 0, runway_meses: null, contratos_ativos: 0, churn_rate: 0, ...p,
  }
}

describe('gerarCommentary (mock LLM)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.LLM_MODE = 'mock'
  })

  it('sem mês anterior → resumo neutro, sem destaques', async () => {
    const { gerarCommentary } = await import('@/modules/metricas/commentary')
    const out = await gerarCommentary(mm({ mrr: 10000 }), null)
    expect(out.destaques).toEqual([])
    expect(out.resumo.toLowerCase()).toContain('primeiro mês')
  })

  it('sem variações materiais → resumo de estabilidade', async () => {
    const { gerarCommentary } = await import('@/modules/metricas/commentary')
    const out = await gerarCommentary(mm({ mrr: 10010 }), mm({ mrr: 10000 }))
    expect(out.destaques).toEqual([])
    expect(out.resumo.toLowerCase()).toContain('estável')
  })

  it('com variações materiais → chama LLM mock e retorna destaques', async () => {
    const { gerarCommentary } = await import('@/modules/metricas/commentary')
    const out = await gerarCommentary(mm({ mrr: 18000, despesa_total: 12000 }), mm({ mrr: 10000, despesa_total: 0 }))
    expect(out.destaques.length).toBeGreaterThan(0)
    expect(out.resumo.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `npx vitest run tests/unit/modules/metricas/commentary.test.ts`
Expected: FAIL — `Cannot find module '@/modules/metricas/commentary'`.

- [ ] **Step 3: Implementar `gerarCommentary`**

```ts
import 'server-only'
import type { MetricasMes } from './snapshot'
import { montarLinhasVariancia } from './variancia'
import { gerarCommentaryMensal } from '@/lib/llm/client'
import type { CommentaryResult } from '@/lib/llm/types'

const THRESHOLDS = { pct: 5, abs: 50 }

/**
 * Orquestra o comentário mensal: monta variância MoM, filtra por materialidade e
 * delega ao LLM (read-only). Atalhos sem custo de LLM quando não há base ou variação.
 */
export async function gerarCommentary(
  atual: MetricasMes,
  anterior: MetricasMes | null,
): Promise<CommentaryResult> {
  if (!anterior) {
    return { resumo: 'Primeiro mês fechado, sem base de comparação mês-a-mês.', destaques: [] }
  }

  const materiais = montarLinhasVariancia(atual, anterior, THRESHOLDS).filter((l) => l.material)
  if (materiais.length === 0) {
    return { resumo: 'Mês estável: nenhuma variação material vs. o mês anterior.', destaques: [] }
  }

  return gerarCommentaryMensal({
    mes_ref: atual.mes_ref,
    linhas: materiais.map((l) => ({
      linha: l.linha,
      atual: l.atual,
      anterior: l.anterior,
      delta: l.delta,
      delta_pct: l.delta_pct,
    })),
    thresholds: THRESHOLDS,
  })
}
```

- [ ] **Step 4: Rodar o teste e verificar que passa**

Run: `npx vitest run tests/unit/modules/metricas/commentary.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/metricas/commentary.ts tests/unit/modules/metricas/commentary.test.ts
git commit -m "feat(metricas): gerarCommentary orchestrator (TDD)"
```

---

## Task 7: `computeMetricasMes` (I/O) + `fecharMes` + teste de integração

**Files:**
- Modify: `src/modules/metricas/snapshot.ts` (adiciona `computeMetricasMes`)
- Create: `src/modules/metricas/fechamento.ts`
- Test: `tests/integration/metricas-fechamento.test.ts`

- [ ] **Step 1: Adicionar `computeMetricasMes` em `snapshot.ts`**

Anexar ao final de `src/modules/metricas/snapshot.ts` (e adicionar imports no topo):

```ts
import { createServiceClient } from '@/lib/supabase/service'
```

```ts
/** Carrega dados reais do mês e monta as métricas realizadas. */
export async function computeMetricasMes(mesRef: string): Promise<MetricasMes> {
  const admin = createServiceClient()
  const fimMes = addMonthsFirstDay(mesRef, 1)

  const { data: contratosRows } = await admin.from('contratos').select('*')
  const contratos = (contratosRows ?? []) as Contrato[]

  const { data: lancs } = await admin
    .from('lancamentos').select('tipo, valor')
    .gte('data', mesRef).lt('data', fimMes)
  const lancamentos = ((lancs ?? []) as { tipo: 'entrada' | 'saida'; valor: number | string }[])
    .map((l) => ({ tipo: l.tipo, valor: Number(l.valor) }))

  const { data: contas } = await admin
    .from('contas_bancarias').select('saldo_atual').eq('ativa', true)
  const caixaFim = (contas ?? []).reduce((s, c) => s + Number(c.saldo_atual), 0)

  return montarMetricas({ mesRef, contratos, lancamentos, caixaFim })
}

/** Primeiro dia do mês deslocado por `months` (positivo ou negativo). */
export function addMonthsFirstDay(mesRef: string, months: number): string {
  const [y, m] = mesRef.split('-').map(Number)
  const total = y! * 12 + (m! - 1) + months
  const yy = Math.floor(total / 12)
  const mm = (total % 12) + 1
  return `${yy}-${String(mm).padStart(2, '0')}-01`
}
```

- [ ] **Step 2: Implementar `fecharMes` em `fechamento.ts`**

```ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { computeMetricasMes, addMonthsFirstDay, type MetricasMes } from './snapshot'
import { gerarCommentary } from './commentary'

function rowToMetricas(row: Record<string, unknown>): MetricasMes {
  return {
    mes_ref: row.mes_ref as string,
    mrr: Number(row.mrr),
    arr: Number(row.arr),
    receita_total: Number(row.receita_total),
    despesa_total: Number(row.despesa_total),
    resultado: Number(row.resultado),
    caixa_fim: Number(row.caixa_fim),
    runway_meses: row.runway_meses === null ? null : Number(row.runway_meses),
    contratos_ativos: Number(row.contratos_ativos),
    churn_rate: Number(row.churn_rate),
  }
}

/**
 * Fecha um mês: computa métricas realizadas, gera o comentário IA comparando com o mês
 * anterior fechado, e grava (upsert por mes_ref). Idempotente.
 */
export async function fecharMes(mesRef: string, usuarioId: string): Promise<MetricasMes> {
  const admin = createServiceClient()
  const atual = await computeMetricasMes(mesRef)

  const anteriorRef = addMonthsFirstDay(mesRef, -1)
  const { data: prevRow } = await admin
    .from('metricas_mensais').select('*').eq('mes_ref', anteriorRef).maybeSingle()
  const anterior = prevRow ? rowToMetricas(prevRow as Record<string, unknown>) : null

  const commentary = await gerarCommentary(atual, anterior)

  const { error } = await admin.from('metricas_mensais').upsert(
    {
      ...atual,
      commentary_resumo: commentary.resumo,
      commentary_destaques: commentary.destaques,
      fechado_por: usuarioId,
      fechado_em: new Date().toISOString(),
    },
    { onConflict: 'mes_ref' },
  )
  if (error) throw new Error(`fecharMes: ${error.message}`)

  return atual
}
```

- [ ] **Step 3: Escrever o teste de integração**

Espelha `tests/integration/forecast-recompute.test.ts` (admin client direto, seed via service role).

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.LLM_MODE = 'mock'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function admin() {
  return createClient('http://127.0.0.1:54321', SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('fecharMes', () => {
  beforeEach(async () => {
    const db = admin()
    await db.from('metricas_mensais').delete().neq('mes_ref', '1900-01-01')
  })

  it('grava snapshot do mês com receita/despesa/resultado e commentary', async () => {
    const db = admin()
    const mes = '2026-03-01'

    // Seed lancamentos do mês
    await db.from('lancamentos').insert([
      { tipo: 'entrada', valor: 12000, data: '2026-03-05', descricao: `e-${Date.now()}`, conciliado: true },
      { tipo: 'saida', valor: 8000, data: '2026-03-10', descricao: `s-${Date.now()}`, conciliado: true },
    ])
    await db.from('contas_bancarias').insert({ banco: `T-${Date.now()}`, tipo: 'cc', saldo_atual: 40000 })

    const { fecharMes } = await import('@/modules/metricas/fechamento')
    // usa um usuario admin qualquer existente (ou null se a coluna aceitar)
    const { data: u } = await db.from('usuarios').select('id').limit(1).maybeSingle()
    await fecharMes(mes, u?.id ?? null as unknown as string)

    const { data: row } = await db.from('metricas_mensais').select('*').eq('mes_ref', mes).single()
    expect(Number(row!.receita_total)).toBeGreaterThanOrEqual(12000)
    expect(Number(row!.despesa_total)).toBeGreaterThanOrEqual(8000)
    expect(row!.commentary_resumo).toBeTruthy()
  })

  it('é idempotente — re-fechar regrava sem duplicar', async () => {
    const db = admin()
    const mes = '2026-03-01'
    const { fecharMes } = await import('@/modules/metricas/fechamento')
    const { data: u } = await db.from('usuarios').select('id').limit(1).maybeSingle()

    await fecharMes(mes, u?.id ?? null as unknown as string)
    await fecharMes(mes, u?.id ?? null as unknown as string)

    const { count } = await db
      .from('metricas_mensais').select('mes_ref', { count: 'exact', head: true }).eq('mes_ref', mes)
    expect(count).toBe(1)
  })
})
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/integration/metricas-fechamento.test.ts`
Expected: PASS (2 testes). Requer Supabase local rodando (`npx supabase status`).

- [ ] **Step 5: Commit**

```bash
git add src/modules/metricas/snapshot.ts src/modules/metricas/fechamento.ts tests/integration/metricas-fechamento.test.ts
git commit -m "feat(metricas): computeMetricasMes + fecharMes upsert + integration (TDD)"
```

---

## Task 8: Componente `TendenciaChart`

**Files:**
- Create: `src/components/tendencia-chart.tsx`

- [ ] **Step 1: Implementar o gráfico (client component)**

Espelha `src/components/forecast-chart.tsx` (recharts, ResponsiveContainer). Duas linhas: MRR e Caixa.

```tsx
'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type TendenciaRow = { mes: string; MRR: number; Caixa: number }

const COLORS = { MRR: '#0072B2', Caixa: '#009E73' }

export function TendenciaChart({ rows }: { rows: TendenciaRow[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={rows}>
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => typeof v === 'number' ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : v} />
          <Legend />
          <Line type="monotone" dataKey="MRR" stroke={COLORS.MRR} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Caixa" stroke={COLORS.Caixa} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Verificar typecheck/lint**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/components/tendencia-chart.tsx
git commit -m "feat(ui): TendenciaChart component (MRR + Caixa)"
```

---

## Task 9: Página Dashboard executivo

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

Reusa `loadSnapshot` (forecast) para os KPIs ao vivo, lê o runway Base de `forecast_projecoes` (já calculado, considera receita), `metricas_mensais` para a tendência + commentary do último mês fechado, e `alertas` para o painel. Fechamento via Server Action restrita a admin.

> **Nota de escopo (vs. §6 do spec):** os KPI cards ao vivo usam `loadSnapshot` (MRR, Caixa, Burn 90d, AR/AP 30d, Contratos) + runway do cenário Base. "Resultado do mês" realizado aparece no widget de mês fechado e na tendência, não como card ao vivo (evita um segundo caminho de cálculo de "mês parcial").

- [ ] **Step 1: Reescrever `page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TendenciaChart } from '@/components/tendencia-chart'
import { loadSnapshot } from '@/modules/forecast/snapshot'

const SEV_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  info: 'secondary', warning: 'outline', critical: 'destructive',
}
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function brl(n: number): string {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function primeiroDiaMesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function addMesesPrimeiroDia(mesRef: string, months: number): string {
  const [y, m] = mesRef.split('-').map(Number)
  const total = y! * 12 + (m! - 1) + months
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}
function labelMes(mesRef: string): string {
  const [y, m] = mesRef.split('-').map(Number)
  return `${MESES_PT[m! - 1]}/${y}`
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: usuario } = await supabase
    .from('usuarios').select('nome, role').eq('id', user!.id).single()
  const isAdmin = usuario?.role === 'admin'

  const mesAtual = primeiroDiaMesAtual()
  const mesAFechar = addMesesPrimeiroDia(mesAtual, -1)

  // KPIs ao vivo
  const snap = await loadSnapshot(mesAtual)
  const burn = snap.despesaMensalAtual
  // Runway do cenário Base (já calculado pelo forecast)
  const { data: baseCenario } = await supabase
    .from('forecast_cenarios').select('id').eq('nome', 'Base').maybeSingle()
  let runwayBase: number | null = null
  if (baseCenario) {
    const { data: proj } = await supabase
      .from('forecast_projecoes').select('runway_meses').eq('cenario_id', baseCenario.id).limit(1).maybeSingle()
    runwayBase = proj?.runway_meses ?? null
  }

  // Tendência (meses fechados)
  const { data: mensais } = await supabase
    .from('metricas_mensais').select('*').order('mes_ref', { ascending: true })
  const fechados = mensais ?? []
  const tendencia = fechados.map((m) => ({
    mes: (m.mes_ref as string).slice(0, 7),
    MRR: Number(m.mrr),
    Caixa: Number(m.caixa_fim),
  }))
  const ultimoFechado = fechados.length ? fechados[fechados.length - 1] : null

  // Alertas recentes não-lidos (critical/warning primeiro)
  const { data: alertas } = await supabase
    .from('alertas').select('*').eq('lido', false).order('criado_em', { ascending: false }).limit(50)
  const ordemSev: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  const alertasTop = (alertas ?? [])
    .sort((a, b) => (ordemSev[a.severidade as string] ?? 3) - (ordemSev[b.severidade as string] ?? 3))
    .slice(0, 5)

  async function fecharMesAction() {
    'use server'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) throw new Error('not authenticated')
    const { data: me } = await sb.from('usuarios').select('role').eq('id', u.id).single()
    if (me?.role !== 'admin') throw new Error('apenas admin pode fechar o mês')
    const alvo = addMesesPrimeiroDia(primeiroDiaMesAtual(), -1)
    const { fecharMes } = await import('@/modules/metricas/fechamento')
    await fecharMes(alvo, u.id)
    revalidatePath('/')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-neutral-600">Olá, <strong>{usuario?.nome ?? user!.email}</strong> ({usuario?.role ?? '?'}).</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi titulo="MRR" valor={brl(snap.mrrAtual)} />
        <Kpi titulo="Caixa atual" valor={brl(snap.caixaAtual)} />
        <Kpi titulo="Runway" valor={runwayBase === null ? '> 36 meses' : `${runwayBase} meses`} />
        <Kpi titulo="Burn mensal" valor={brl(burn)} />
        <Kpi titulo="AR (30d)" valor={brl(snap.arPrevisto30d)} />
        <Kpi titulo="Contratos ativos" valor={String(snap.contratosAtivos)} />
      </div>

      {/* Tendência */}
      <Card>
        <CardHeader><CardTitle>Tendência (meses fechados)</CardTitle></CardHeader>
        <CardContent>
          {tendencia.length < 2
            ? <p className="text-neutral-500 text-sm">Feche ao menos 2 meses para ver a tendência.</p>
            : <TendenciaChart rows={tendencia} />}
        </CardContent>
      </Card>

      {/* Comentário mensal IA */}
      <Card>
        <CardHeader><CardTitle>Comentário mensal IA{ultimoFechado ? ` — ${labelMes(ultimoFechado.mes_ref as string)}` : ''}</CardTitle></CardHeader>
        <CardContent>
          {!ultimoFechado || !ultimoFechado.commentary_resumo
            ? <p className="text-neutral-500 text-sm">Nenhum mês fechado ainda.</p>
            : (
              <div className="space-y-3">
                <p className="text-sm text-neutral-700">{ultimoFechado.commentary_resumo as string}</p>
                {Array.isArray(ultimoFechado.commentary_destaques) && (ultimoFechado.commentary_destaques as unknown[]).length > 0 && (
                  <ul className="text-sm text-neutral-600 list-disc pl-5 space-y-1">
                    {(ultimoFechado.commentary_destaques as { linha: string; driver: string; magnitude: string }[]).map((d, i) => (
                      <li key={i}><strong>{d.linha}</strong>: {d.driver} ({d.magnitude})</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
        </CardContent>
      </Card>

      {/* Alertas recentes */}
      <Card>
        <CardHeader><CardTitle>Alertas recentes</CardTitle></CardHeader>
        <CardContent>
          {alertasTop.length === 0
            ? <p className="text-neutral-500 text-sm">Nenhum alerta não-lido.</p>
            : (
              <div className="space-y-2">
                {alertasTop.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    <Badge variant={SEV_VARIANT[a.severidade as string]}>{a.severidade}</Badge>
                    <span className="font-medium">{a.titulo}</span>
                    <span className="text-neutral-500">— {a.mensagem}</span>
                  </div>
                ))}
                <a href="/alertas" className="text-sm text-blue-600 hover:underline">Ver todos →</a>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Fechamento (admin) */}
      {isAdmin && (
        <Card>
          <CardHeader><CardTitle>Fechamento mensal</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <p className="text-sm text-neutral-600">
              Último fechado: {ultimoFechado ? labelMes(ultimoFechado.mes_ref as string) : '—'}
            </p>
            <form action={fecharMesAction}>
              <Button type="submit">Fechar mês {labelMes(mesAFechar)}</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Kpi({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-neutral-500">{titulo}</div>
        <div className="text-xl font-semibold">{valor}</div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verificar typecheck + build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui (a rota `/` compila como dynamic Server Component).

- [ ] **Step 3: Smoke manual (opcional mas recomendado)**

Run: `npm run dev` e abrir `http://localhost:3000/`. Logar, confirmar: KPI cards preenchidos, tendência mostra estado vazio (<2 meses), botão "Fechar mês" visível só para admin. Como admin, clicar "Fechar mês" → o widget de comentário IA e a tendência passam a refletir o mês fechado.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/page.tsx"
git commit -m "feat(ui): dashboard executivo — KPIs, tendência, commentary IA, alertas, fechamento"
```

---

## Task 10: Verificação final da suíte

**Files:** nenhum (validação).

- [ ] **Step 1: Rodar a suíte completa**

Run: `npm test`
Expected: todos os projetos (unit + integration) verdes. Os novos: 4 (snapshot) + 4 (variancia) + 3 (commentary) unit + 2 (fechamento) integration.

- [ ] **Step 2: Atualizar a memória do projeto**

Atualizar `MEMORY.md` / `project_iagentics_financial.md` com Fase 6 completa (contagem de commits/tabelas/testes). Não commitar a memória (fica em `~/.claude`).

- [ ] **Step 3: Marcar a fase no roadmap**

Se houver seção de roadmap no spec mãe, marcar Fase 6 como completa e commitar:

```bash
git add docs/superpowers/specs/2026-05-27-sistema-financeiro-iagentics-design.md
git commit -m "docs: mark Phase 6 complete in roadmap"
```

---

## Self-Review (preenchido pelo autor do plano)

- **Cobertura do spec:** §4 tabela → Task 1. §5 módulo (snapshot/fechamento/commentary) → Tasks 2,3,6,7. §6 UI (KPIs, tendência, commentary, alertas, fechamento admin) → Tasks 8,9 (com nota de escopo sobre "resultado do mês" ao vivo). §7 prompt → Task 4/5. §8 testes (unit + integração + mock LLM) → Tasks 2,3,6,7,10. §13.4 property test era opcional → coberto implicitamente pelo teste de `montarMetricas` (resultado = receita − despesa); não criei task separada (YAGNI).
- **Consistência de tipos:** `MetricasMes` definido na Task 2 e reusado em 3/6/7/9. `LinhaVariancia` def. na Task 3, consumido na 6. `CommentaryResult` def. na Task 4, retornado por 6 e consumido na 9. `CommentaryInput` é estrutural (inline no client.ts) — sem dependência circular módulo→lib. `addMonthsFirstDay` exportado na Task 7 e reusado; a página tem sua própria `addMesesPrimeiroDia` (Server Component não importa `server-only` util desnecessariamente — duplicação mínima e intencional para manter a página independente).
- **Placeholders:** nenhum TODO/TBD; todo passo com código mostra o código completo.
