# Fase 7 — Copiloto Financeiro (Managed Agent) — design

**Data:** 2026-05-29
**Status:** aprovado (brainstorming)
**Spec mãe:** `docs/superpowers/specs/2026-05-27-sistema-financeiro-iagentics-design.md` (§13.7 Managed Agents; §13.3/§5.7 read-only orchestrator / write-only leaf)

## 1. Objetivo

Dar ao founder um **copiloto financeiro conversacional** (Q&A) sobre os dados do sistema:
responder perguntas descritivas (estado e histórico), simular cenários what-if reusando o
engine de forecast, e **propor ações** (executadas só após confirmação humana). É a
realização da Fase 7 (Managed Agents do §13.7), no formato interativo in-product.

## 2. Escopo

**Inclui:**
- Página `/copiloto` (chat) restrita a `role in (admin, financeiro)`.
- Route handler `POST /api/copiloto` rodando o loop de tool-use (Anthropic Messages API).
- Módulo `src/modules/copiloto/`: orquestrador, tools de leitura tipadas, SQL read-only
  sandboxed, write-leaf de ações.
- Migração: role Postgres `copiloto_ro` (read-only, allowlist).
- Prompt `prompts/copiloto/SKILL.md`.
- Fluxo de confirmação humana para as 4 ações.

**Fora:**
- Headless via `agent.yaml` (Claude Agent SDK) — ver D1.
- Persistência de conversas — conversas são efêmeras no v1 (ver D3).
- Streaming de tokens — resposta por turno completo no v1.
- Ações fora da whitelist das 4 definidas.

## 3. Decisões de design

- **D1 — Runtime: loop in-app sobre a Anthropic Messages API (não Agent SDK headless).**
  O §13.7 cita "Managed Agent headless via `agent.yaml`". Para um copiloto **interativo**
  com confirmação humana, um loop in-app dá controle preciso do gate read/write e reusa a
  stack de LLM já no repo (`@anthropic-ai/sdk` + prompt caching). Divergência consciente:
  nosso agente é in-product, não headless. Headless agendado fica para fluxo futuro
  (ex: fechamento mensal E2E).
- **D2 — Padrão read-only orchestrator / write-only leaf.** O orquestrador nunca recebe um
  client de escrita. Lê via tools tipadas (service client) + SQL read-only. Escreve apenas
  através do write-leaf, após confirmação humana e re-check de role.
- **D3 — Conversas efêmeras no v1.** Histórico vive no client e é reenviado a cada request.
  Sem tabela de chat (YAGNI). Ações executadas ficam no `audit_log` existente. Persistência
  fica como evolução futura.
- **D4 — Modelo `claude-sonnet-4-6` para o orquestrador.** Diverge do default Haiku
  (usado em tarefas batch como categorização). Justificado: copiloto interativo de baixo
  volume com reasoning multi-passo. Cap de iterações de tool no loop (anti-runaway).

## 4. Arquitetura

```
Browser (/copiloto, client component)
   │  histórico de mensagens (efêmero)
   ▼
POST /api/copiloto  ───────────────► loop orquestrador (agente.ts)
   │                                    │  Messages API (claude-sonnet-4-6, prompt caching)
   │                                    │  dispatch de tools (≤ N iterações)
   │   ┌───────────── tools de leitura (executam no loop) ───────────────┐
   │   │ get_estado_atual · get_metricas_historico · simular_forecast    │
   │   │ query_sql (role copiloto_ro, read-only)                          │
   │   └──────────────────────────────────────────────────────────────────┘
   │   ┌──────────── tools de proposta (NÃO executam) ──────────────────┐
   │   │ propor_salvar_cenario · propor_marcar_alertas_lidos             │
   │   │ propor_fechar_mes · propor_criar_regra                          │
   │   └──────────────────────────────────────────────────────────────────┘
   ▼
resposta { mensagem, proposta? }
   │ se proposta → UI mostra card Confirmar/Cancelar
   ▼ (ao confirmar)
server action executarAcao(proposta)
   │  Zod + re-check role + audit log
   ▼
funções de módulo existentes (atualizarCenario/recomputarProjecoes,
  update alertas, fecharMes, criar regra_categorizacao)
```

## 5. Módulo `src/modules/copiloto/`

### 5.1 `agente.ts` — orquestrador
- `responder(historico: Mensagem[]): Promise<RespostaAgente>` onde
  `RespostaAgente = { mensagem: string; proposta?: ProposedAction }`.
- Loop: monta system prompt (de `prompts/copiloto/SKILL.md`, cacheado) + histórico, chama
  Messages API com as tool definitions. Enquanto o modelo pedir tools de **leitura**:
  executa, reinjeta o resultado, continua (até cap de iterações). Se o modelo pedir uma
  tool de **proposta**: captura a `ProposedAction`, **não executa**, encerra retornando a
  mensagem do agente + a proposta.
- `LLM_MODE` ≠ `real` → mock determinístico (sem rede): responde de forma canônica e, para
  inputs de teste específicos, devolve uma proposta fixa.

### 5.2 `tools-leitura.ts`
Definições (JSON schema) + handlers server-side:
- `get_estado_atual()` → reusa `loadSnapshot` (MRR, caixa, burn, runway via Base, AR/AP, contratos).
- `get_metricas_historico({ meses?: number })` → lê `metricas_mensais` ordenado.
- `simular_forecast({ drivers })` → roda `gerarForecast(snapshot, drivers, ...)` e devolve
  projeção 12m + runway. Drivers seguem o schema `Drivers` existente (`@/lib/schemas/cenario`).
- `query_sql({ sql })` → delega a `sql.ts`.

### 5.3 `sql.ts` — SQL read-only sandboxed
- Conexão Postgres via `pg` usando `COPILOTO_DATABASE_URL` (role `copiloto_ro`).
- Validação defensiva antes de executar: trim; rejeita se não começa com `select` ou `with`
  (case-insensitive); rejeita `;` que separe múltiplos statements; rejeita tokens DML/DDL
  (`insert|update|delete|drop|alter|create|grant|truncate|copy`) por regex de palavra.
- Garante `LIMIT` (se ausente, anexa `LIMIT 500`).
- A barreira real é o **role**: `default_transaction_read_only = on`, `statement_timeout`
  curto, e `GRANT SELECT` apenas na allowlist (ver §6). Validação é defense-in-depth.
- Retorna `{ colunas, linhas }` (linhas truncadas ao limite).

### 5.4 `acoes.ts` — write-leaf
- `ProposedAction` = união discriminada por `tipo`:
  - `salvar_cenario` → `{ nome: string; drivers: Drivers }`
  - `marcar_alertas_lidos` → `{ ids: string[] }`
  - `fechar_mes` → `{ mes_ref: string }`
  - `criar_regra` → `{ padrao: string; categoria_id: string }`
- `executarAcao(acao: ProposedAction, usuarioId: string): Promise<ResultadoAcao>`:
  valida com Zod; re-checa role (admin para `fechar_mes`); despacha:
  - `salvar_cenario` → `atualizarCenario`/criar + `recomputarProjecoes`.
  - `marcar_alertas_lidos` → update em `alertas` (lido=true, lido_por, lido_em).
  - `fechar_mes` → `fecharMes(mes_ref, usuarioId)`.
  - `criar_regra` → insert em `regras_categorizacao` (schema/módulo existente).
  - grava `audit_log` para cada execução.

## 6. Migração — role `copiloto_ro`

Nova migração `0028_copiloto_ro.sql`:
- `create role copiloto_ro with login password '<env>' nosuperuser nocreatedb nocreaterole;`
  (senha vem de variável; em local, valor fixo de dev).
- `alter role copiloto_ro set default_transaction_read_only = on;`
- `alter role copiloto_ro set statement_timeout = '5s';`
- `grant usage on schema public to copiloto_ro;`
- `grant select on` **allowlist**: `contratos, clientes, projetos, contas_a_receber,
  contas_a_pagar, lancamentos, despesas_recorrentes, fornecedores, categorias,
  funcionarios, pj_spot, folha_corridas, itens_folha, forecast_cenarios,
  forecast_projecoes, metricas_mensais, alertas, contas_bancarias, regras_categorizacao`.
- **NÃO** concede: `usuarios`, `audit_log`, tabelas de auth.
- `COPILOTO_DATABASE_URL` no `.env.local` (dev) e configurado em produção.

> Nota: a lista exata de tabelas será confirmada contra o schema real no plano (algumas
> podem ter nomes levemente diferentes); o princípio é negócio sim, auth/PII não.

## 7. Prompt `prompts/copiloto/SKILL.md`

System prompt: define o papel (copiloto financeiro da IAgentics, PT-BR), as tools
disponíveis e quando usar cada uma (typed tools para estado/histórico/simulação; `query_sql`
para a cauda longa; tools de proposta para ações), e as **regras**: nunca inventar números
(usar só resultados de tools); ao simular, deixar claro que é hipótese; ao propor ação,
explicar o efeito e pedir confirmação; nunca afirmar que executou algo antes da confirmação.

## 8. Interface `/copiloto`

- Page (Server Component) gated por `role in (admin, financeiro)`.
- Client component de chat: lista de mensagens, input, render do card de proposta quando
  presente (Confirmar/Cancelar). Confirmar → server action `executarAcao` → exibe resultado.
- Item no sidebar.

## 9. Segurança

- SQL: role read-only + allowlist (privilégio) + transação read-only + `statement_timeout`
  + validação single-SELECT + `LIMIT` forçado.
- Ações: Zod + re-check de role + confirmação humana obrigatória + audit log; nenhuma
  auto-executa.
- Orquestrador nunca recebe client de escrita.
- Loop: cap de iterações de tool; mock mode determinístico para testes.
- Página e API restritas a admin/financeiro.

## 10. Testes

- **Unit:** validador de SQL (rejeita não-SELECT, múltiplos statements, DML/DDL; força
  LIMIT); captura de `ProposedAction` no loop; dispatch de tools de leitura; loop com client
  Anthropic mockado (mock mode).
- **Integração:** `query_sql` retorna linhas no DB local **e** `copiloto_ro` rejeita
  INSERT/UPDATE (erro de permissão / transação read-only); `simular_forecast` produz
  projeção 12m; `executarAcao` para cada uma das 4 ações com re-check de role
  (não-admin bloqueado em `fechar_mes`); `fechar_mes` via ação é idempotente.
- **Mock LLM** em todos os testes de loop (sem rede/custo).

## 11. Critérios de sucesso

- Pergunta descritiva (estado/histórico) → resposta fundamentada em dados, sem números inventados.
- What-if ("runway se contratar 2 devs a R$ 15k") → agente roda `simular_forecast` e explica.
- Agente propõe ação → só executa após confirmação; não-admin não fecha mês; tudo auditado.
- `copiloto_ro` comprovadamente não escreve.
- Suíte verde com mock LLM; build OK.
