# Fase 6 — Dashboard Executivo (design)

**Data:** 2026-05-28
**Status:** aprovado (brainstorming)
**Spec mãe:** `docs/superpowers/specs/2026-05-27-sistema-financeiro-iagentics-design.md` (§5, §13.3, §13.4)

## 1. Objetivo

Substituir o placeholder da home (`src/app/(dashboard)/page.tsx`) por um dashboard
executivo que dá ao founder visibilidade imediata de MRR/caixa/runway/burn, tendência
histórica mensal, alertas recentes, e um comentário mensal gerado por IA. Introduz a
persistência de métricas mensais (fechamento) que faltava no sistema.

## 2. Escopo

**Inclui:**
- Tabela `metricas_mensais` (snapshot mensal persistido).
- Módulo `src/modules/metricas/` (snapshot, fechamento, commentary).
- Dashboard executivo: KPI cards ao vivo, gráfico de tendência 12m, widget de
  comentário IA, painel de alertas recentes, bloco de fechamento manual (admin).
- Preenchimento do prompt `prompts/commentary/SKILL.md`.

**Fora:**
- Forecast vs. realizado com baseline congelado — ver Decisão D2 (usamos variância MoM).
- Fechamento automático por cron — fechamento é manual (Decisão D1).
- Exportação/PDF do dashboard.

## 3. Decisões de design

- **D1 — Fechamento manual.** Admin clica "Fechar mês [mês anterior]" no dashboard, o que
  grava o snapshot e dispara o commentary IA. Alinha com o limite do §13.3 ("1x/mês, não
  ad-hoc") e mantém o custo de LLM sob controle. Sem cron.
- **D2 — Variância MoM (divergência consciente do §13.3).** O spec mãe descreve o
  commentary como "Forecast vs. realizado". Optamos por comparar o mês realizado contra o
  **mês realizado anterior** (variância mês-a-mês). É mais simples (não exige congelar
  baseline de forecast) e suficiente para a leitura executiva atual. Caso forecast-vs-real
  seja necessário no futuro, exigirá congelar a projeção Base por mês — fica registrado
  como evolução possível.
- **D3 — Arquitetura: módulo `metricas` dedicado.** Lógica financeira em
  `src/modules/metricas/`, testável isoladamente, seguindo o padrão `modules/<domínio>`. O
  `loadSnapshot` do forecast permanece (propósito forward-looking distinto); o reuso real é
  `calcularMRR/ARR/ChurnRate` e um helper de soma de caixa extraído.

## 4. Modelo de dados

### Tabela `metricas_mensais` (nova migração)

Uma linha por mês fechado; `mes_ref` = primeiro dia do mês, `UNIQUE`.

```sql
metricas_mensais
  id uuid pk default gen_random_uuid()
  mes_ref date not null unique          -- ex: 2026-04-01
  mrr numeric not null
  arr numeric not null
  receita_total numeric not null        -- Σ lancamentos tipo=entrada no mês
  despesa_total numeric not null        -- Σ lancamentos tipo=saida no mês
  resultado numeric not null            -- receita_total - despesa_total
  caixa_fim numeric not null            -- Σ saldo_atual de contas_bancarias ativas no fechamento
  runway_meses numeric                  -- caixa_fim / despesa_total; null se despesa=0 ou >36
  contratos_ativos int not null
  churn_rate numeric not null
  commentary_resumo text                -- 3-5 sentenças IA (null até gerar)
  commentary_destaques jsonb            -- [{linha, driver, magnitude}]
  fechado_por uuid references usuarios(id)
  fechado_em timestamptz not null default now()
  criado_em timestamptz not null default now()
```

**RLS:** SELECT para autenticados; INSERT/UPDATE apenas via service client (igual a
`forecast_projecoes`). Fechar um mês já fechado → **upsert** por `mes_ref` (idempotente:
regrava métricas e regera commentary).

## 5. Módulo `src/modules/metricas/`

- **`snapshot.ts` — `computeMetricasMes(mesRef): Promise<MetricasMes>`**
  Computa as métricas *realizadas* do mês a partir dos dados reais:
  - `receita_total` / `despesa_total`: soma de `lancamentos` (`tipo` entrada/saida) com
    `data` dentro do mês `[mes_ref, próximo mês)`.
  - `resultado = receita_total - despesa_total`.
  - `caixa_fim`: Σ `saldo_atual` de `contas_bancarias` ativas (no momento do fechamento).
  - `mrr`/`arr`/`churn_rate`: `calcularMRR/calcularARR/calcularChurnRate` sobre contratos
    ativos no fim do mês.
  - `runway_meses`: `caixa_fim / despesa_total`, arredondado; `null` se `despesa_total = 0`
    ou se o quociente `> 36` (mesma convenção "> 36 meses" usada na página de forecast).
  - `contratos_ativos`: contagem.

- **`fechamento.ts` — `fecharMes(mesRef, usuarioId): Promise<MetricasMes>`**
  Chama `computeMetricasMes`, faz upsert em `metricas_mensais`, busca o mês anterior fechado,
  chama `gerarCommentary(atual, anterior)` e grava `commentary_resumo`/`commentary_destaques`
  na mesma linha. Idempotente.

- **`commentary.ts` — `gerarCommentary(atual, anterior): Promise<{resumo, destaques}>`**
  Monta `linhas_variancia` MoM (mrr, receita_total, despesa_total, caixa_fim, resultado),
  filtra pela materialidade `max(5% da categoria, R$ 50)`, e chama o LLM (Claude Haiku 4.5
  via client existente, `LLM_MODE=mock` por padrão) com o prompt de `prompts/commentary/SKILL.md`.
  Sem mês anterior → resumo neutro ("primeiro mês fechado, sem base de comparação"),
  `destaques = []`, sem chamada de LLM.

## 6. UI — Dashboard (`src/app/(dashboard)/page.tsx`)

Server Component, substitui o placeholder. Layout vertical:

1. **KPI cards (estado atual ao vivo):** MRR, Caixa atual, Runway, Burn (despesa mensal),
   Resultado do mês corrente, Contratos ativos. Calculado ao vivo (estilo `loadSnapshot`),
   não a partir da tabela histórica. Reusa o componente `Card`.
2. **Gráfico de tendência (12 meses):** lê `metricas_mensais` ordenado por `mes_ref`, plota
   séries MRR + Caixa (recharts, padrão do `ForecastChart`). <2 meses fechados → estado
   vazio ("feche o primeiro mês para ver a tendência").
3. **Widget "Comentário mensal IA":** `commentary_resumo` + lista de `destaques` do último
   mês fechado. Vazio se nenhum mês foi fechado.
4. **Alertas recentes:** top 3-5 alertas não-lidos (critical/warning primeiro) com link para
   `/alertas`. Reusa dados do módulo `alertas`.
5. **Bloco de fechamento (admin only):** mostra o último mês fechado e um botão
   "Fechar mês [mês anterior]" → Server Action `fecharMes`. Não-admins não veem o botão
   (checagem de `role` em `usuarios`). Após fechar, `revalidatePath('/')`.

## 7. Prompt `prompts/commentary/SKILL.md`

Preencher o stub existente:
- **Inputs:** `mes_ref`, `linhas_variancia` (array MoM já filtrado por materialidade),
  `thresholds` (`{pct: 5, abs: 50}`).
- **Procedimento:** para cada linha material, explicar o **driver** da variação (não apenas
  restituir o percentual); priorizar as maiores magnitudes; 3-5 sentenças no resumo.
- **Outputs:** `resumo` (string PT-BR, 3-5 sentenças), `destaques`
  (`[{linha, driver, magnitude}]`).
- **Restrições:** nunca inventar números (usar só dados de entrada); sempre PT-BR; 1x/mês.
- **Exemplos:** 1-2 few-shot (ex: MRR +R$8k por novo contrato; despesa +R$12k por folha
  de 13º).

## 8. Testes

- **Unit:** `computeMetricasMes` com dados semeados; construtor de `linhas_variancia` +
  threshold `max(5%, R$50)`; runway edge cases (`despesa=0 → null`, `>36 → null`).
- **Integração:** `fecharMes` ponta-a-ponta (semeia lancamentos/contratos/contas → fecha →
  confere linha + commentary gravados); idempotência (re-fechar regrava sem duplicar).
- **Mock LLM:** commentary roda com `LLM_MODE=mock`, saída determinística (sem rede/custo).
- **Property test (opcional, §13.4):** invariante `receita_total - despesa_total = resultado`
  no snapshot.

## 9. Critérios de sucesso

- Admin fecha um mês e vê o snapshot persistido + comentário IA no dashboard.
- KPI cards refletem o estado atual ao vivo.
- Gráfico de tendência aparece após ≥2 meses fechados.
- Não-admin não consegue fechar mês.
- Suite de testes verde (unit + integração + mock LLM).
