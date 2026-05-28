# Sistema de Gestão Financeira IAgentics — Design

**Data:** 2026-05-27
**Status:** Aprovado para implementação
**Autor:** Brainstorming session (rgoalves@gmail.com)

---

## 1. Contexto e Objetivo

A IAgentics é uma startup de multiagentes de IA para compras, finanças e supply chain. Modelo de receita híbrido: **AaaS (Agent-as-a-Service) recorrente** + **projetos pontuais** de implementação.

Estágio atual: 2 clientes pagantes, meta de chegar a 10. Lançamento futuro de produto PME (centenas de clientes) — fora do escopo deste sistema.

**Objetivo:** sistema custom web para gestão financeira interna da IAgentics com controle de receitas (recorrentes e por projeto), contas a pagar e receber, folha de pagamento (CLT + PJ spot), fluxo de caixa, forecast em cenários, e dashboard executivo.

**Não-objetivos:**
- Não é multi-tenant (uso interno IAgentics apenas)
- Não emite NF-e direto (integra com emissor externo)
- Não substitui contabilidade (não gera SPED, DAS, DCTF)
- Não é o produto PME que a IAgentics vai lançar

**Bônus de dogfooding:** sendo a IAgentics uma startup de automação financeira por agentes IA, este sistema serve como caso real de uso e demo para vendas (categorização IA, forecast, conciliação automática).

---

## 2. Stack & Deploy

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript | Stack moderno, rápido para shipar |
| UI | Tailwind + shadcn/ui + Recharts | Componentes prontos de qualidade |
| Backend | Next.js API routes + Supabase (Postgres 16) | Auth + DB + RLS + Storage num só lugar |
| Jobs | Supabase Edge Functions + pg_cron | Sync diário, alertas, geração de folha |
| LLM | Anthropic Claude Haiku 4.5 | Categorização — barato, rápido, prompt caching |
| Banco (Open Finance) | Pluggy | Sync de extrato bancário automático |
| NF-e | eNotas (ou Nota Azul) | Emissão de NF de serviço via API |
| Email | Resend | Alertas e cobranças |
| Hosting | Vercel + Supabase | ~$25-50/mês esperado |

**Custo operacional estimado:** $40-80/mês (Vercel Pro + Supabase Pro + Pluggy básico + LLM <$5 + Resend free tier).

---

## 3. Estrutura de Pastas

```
src/
  app/
    (dashboard)/
      page.tsx                    # dashboard executivo
      receitas/
        clientes/
        contratos/
        projetos/
      contas-receber/
      despesas/
        fornecedores/
        recorrentes/
      contas-pagar/
      folha/
        funcionarios/
        pj-spot/
        corridas/
      fluxo-caixa/
      forecast/
      relatorios/
      config/
        categorias/
        regras-categorizacao/
        contas-bancarias/
        integracoes/
        usuarios/
    api/                          # endpoints internos (jobs, webhooks)
      webhooks/pluggy/
      webhooks/enotas/
      cron/sync-pluggy/
      cron/gerar-recorrentes/
      cron/alertas/
  modules/                        # lógica de negócio isolada
    receitas/
    contas-receber/
    despesas/
    contas-pagar/
    folha/
    bancos/                       # integração Pluggy
    categorizador/                # cascata regras → histórico → LLM
    forecast/
    alertas/
    audit/
  lib/
    supabase/                     # client server/browser
    schemas/                      # zod
    utils/
  components/                     # UI compartilhada
db/
  migrations/                     # SQL versionado
  seeds/
tests/
  unit/
  integration/
  e2e/
```

**Princípio:** cada `modules/X` expõe interface pública via `index.ts`; rotas e API só consomem via essa interface. Lógica de negócio nunca em componentes ou rotas.

---

## 4. Data Model

### 4.1 Entidades de configuração

```sql
organizacao              -- single row, dados da IAgentics
  id, nome, cnpj, regime_tributario, moeda_padrao, mes_fiscal_inicio

usuarios                 -- ligado ao auth.users do Supabase
  id (= auth.users.id), nome, role: 'admin'|'financeiro'|'leitura', ativo

categorias               -- árvore receita/despesa/transferência
  id, nome, tipo: 'receita'|'despesa'|'transferencia',
  parent_id (self-ref), cor, icone, ativa

contas_bancarias
  id, banco, agencia, conta, tipo: 'cc'|'poupanca'|'investimento',
  moeda, saldo_atual, pluggy_account_id?, ativa
```

### 4.2 Receitas

```sql
clientes
  id, nome, cnpj?, segmento, status: 'ativo'|'inativo'|'churned',
  moeda_padrao, contato_email, contato_telefone, observacoes

contratos                -- AaaS recorrente
  id, cliente_id, nome, tipo: 'mensal'|'anual',
  ticket, moeda, dia_cobranca,
  data_inicio, data_fim?,
  status: 'ativo'|'pausado'|'churned',
  motivo_churn?, data_churn?

projetos                 -- pontuais
  id, cliente_id, nome, descricao,
  valor_total, moeda,
  data_inicio, data_prevista_fim, data_real_fim?,
  status: 'proposta'|'ativo'|'pausado'|'concluido'|'cancelado'

milestones               -- etapas de projeto
  id, projeto_id, ordem, descricao,
  valor, data_prevista, data_real?,
  status: 'pendente'|'em_andamento'|'concluido'|'faturado'|'pago'
```

### 4.3 Contas a Receber (AR)

```sql
contas_a_receber
  id, cliente_id,
  origem: 'contrato'|'milestone'|'avulso', origem_id?,
  valor, moeda, data_emissao, data_vencimento,
  status: 'previsto'|'emitido'|'recebido'|'atrasado'|'cancelado',
  data_recebimento?, lancamento_id?,
  nf_externa_id?, nf_url?,
  observacoes, anexo_path?
```

### 4.4 Despesas

```sql
fornecedores
  id, nome, cnpj?, categoria_default_id?, contato, observacoes, ativo

despesas_recorrentes     -- assinaturas SaaS, aluguel, etc
  id, fornecedor_id, descricao, valor, moeda,
  dia_mes, categoria_id, ativa,
  data_inicio, data_fim?, proxima_geracao
```

### 4.5 Folha de Pagamento

```sql
funcionarios             -- FTE (CLT ou PJ recorrente full-time)
  id, nome, cpf, cargo, tipo: 'clt'|'pj_recorrente',
  salario_base, beneficios_json,
  encargos_pct_json,    -- {fgts: 8, inss_patronal: 20, provisao_13: 8.33, provisao_ferias: 11.11}
  centro_custo,
  data_admissao, data_desligamento?, ativo,
  chave_pix?, banco_conta_json?,
  usuario_id?           -- FK opcional para usuarios; se setado, funcionário pode ver próprio holerite

pj_spot                  -- contratados pontuais
  id, nome, cpf_cnpj, especialidade, contato,
  valor_hora_padrao?, ativo

alocacoes_pj             -- jobs spot por projeto
  id, pj_id, projeto_id?, descricao, escopo,
  tipo_remuneracao: 'fixo'|'hora'|'entregavel',
  valor_total, horas_estimadas?, horas_realizadas?,
  data_inicio, data_prevista_fim,
  status: 'contratado'|'em_andamento'|'concluido'|'pago'

folha                    -- corrida mensal
  id, mes_ref (date, dia=1),
  status: 'aberta'|'fechada',
  gerada_em, fechada_em?, fechada_por?

itens_folha
  id, folha_id, funcionario_id,
  salario_bruto, beneficios_valor, encargos_valor,
  descontos_json, liquido_pagar,
  -- ao fechar folha, gera múltiplos AP via serviço
  -- (1 AP salário, 1 AP FGTS, 1 AP INSS, 1 AP benefícios, APs de provisão)

holerites                -- PDF gerado por item_folha ao fechar
  id, item_folha_id, storage_path, gerado_em

tabelas_fiscais          -- INSS/IRRF por ano (atualização anual manual)
  id, ano, tipo: 'inss'|'irrf', faixas_json
                        -- faixas_json: [{ate: 1500, aliquota: 7.5, deducao: 0}, ...]
```

### 4.6 Contas a Pagar (AP)

```sql
contas_a_pagar
  id,
  tipo_credor: 'fornecedor'|'funcionario'|'pj_spot'|'orgao_publico',
  credor_id,                          -- polimórfico (fornecedor_id, funcionario_id, etc)
  origem: 'recorrente'|'folha'|'alocacao_pj'|'nf'|'avulso', origem_id?,
  descricao, valor, moeda,
  data_vencimento, categoria_id,
  status: 'previsto'|'aprovado'|'pago'|'atrasado'|'cancelado',
  data_pagamento?, lancamento_id?,
  aprovador_id?, aprovado_em?,
  anexo_path?,                        -- boleto/NF no Supabase Storage
  observacoes
```

### 4.7 Lançamentos (caixa realizado)

```sql
lancamentos              -- fonte única de verdade do que efetivamente saiu/entrou
  id, data, valor, conta_id,
  tipo: 'entrada'|'saida'|'transferencia',
  categoria_id?,
  descricao,
  origem: 'manual'|'pluggy'|'ar'|'ap', origem_id?,
  fornecedor_id?, cliente_id?, projeto_id?,
  categorizacao_metodo?: 'manual'|'regra'|'historico'|'llm',
  categorizacao_confianca?,
  conciliado: bool,                   -- se origem=pluggy, true quando vinculado a AP/AR
  pluggy_transaction_id?
```

### 4.8 Categorização

```sql
regras_categorizacao
  id, prioridade, pattern, pattern_tipo: 'contains'|'regex'|'starts_with',
  campo: 'descricao'|'fornecedor', categoria_id,
  criada_por: 'usuario'|'auto', criada_em
```

### 4.9 Forecast

```sql
forecast_cenarios
  id, nome,             -- 'Base', 'Best', 'Worst'
  drivers_json,         -- {novos_clientes_mes, churn_pct, ticket_medio_novo,
                        --  novos_projetos_mes, valor_medio_projeto,
                        --  crescimento_despesa_pct}
  ativo

forecast_projecoes      -- materializado, regenerado on-demand
  id, cenario_id, mes_ref,
  mrr, receita_total, despesa_total, caixa, runway_meses
```

### 4.10 Operacional

```sql
alertas
  id, tipo, severidade: 'info'|'warning'|'critical',
  titulo, mensagem, contexto_json,
  lido, criado_em, lido_em?

audit_log
  id, usuario_id, acao, tabela, registro_id,
  before_json, after_json, motivo?, criado_em
```

---

## 5. Módulos (lógica de negócio)

### 5.1 Receitas
- CRUD de clientes, contratos, projetos, milestones
- **Métricas:** MRR, ARR, NRR, GRR, churn rate, expansion, ticket médio
- Ao criar contrato → agenda geração mensal de AR (job)
- Ao marcar milestone concluído → opção "gerar AR"

### 5.2 Contas a Receber
- Pipeline de AR previstas (próximos 90 dias)
- Ações: emitir NF (chama eNotas), enviar cobrança (Resend), marcar recebido (cria lancamento)
- Aging de inadimplência

### 5.3 Despesas
- CRUD fornecedores, despesas recorrentes
- Lançamento avulso (vai direto a `lancamentos`, sem passar por AP — para gastos já pagos)
- Geração mensal de AP a partir de recorrentes (job)

### 5.4 Folha de Pagamento
- CRUD funcionários, PJs spot, alocações
- **Abrir corrida** do mês → calcula `itens_folha` (salário, benefícios, encargos)
- **Fechar corrida** → gera APs (líquido, FGTS, INSS, VR, VA, provisões) + audit log + bloqueia edição
- Geração de holerite PDF por funcionário (template simples, dados obrigatórios CLT)
- Histórico de corridas (consulta read-only)

### 5.5 Contas a Pagar
- Pipeline de APs (próximos 30 dias destacado)
- **Aprovação** (1 nível): admin aprova → fica `aprovado` → quando pago, vira `lancamento`
- Agendamento de pagamento (data prevista)
- Upload de boleto/NF como anexo

### 5.6 Bancos (integração Pluggy)
- Conectar conta bancária via Pluggy Connect widget
- Job diário 06h: sincroniza transações desde último sync, cria `lancamentos` `origem=pluggy, conciliado=false`
- Job de conciliação: matching com AP/AR previstos (ver §6.2)

### 5.7 Categorizador
- Cascata: regras → histórico (fornecedor já visto 3+ vezes) → Claude Haiku → pendente
- Ver §6.1

### 5.8 Forecast
- Função `gerar_forecast(cenario_id, meses)` (ver §6.3)
- UI editor de cenários (drivers tipo planilha)
- Gráficos comparativos 3 cenários

### 5.9 Alertas
- Cron diário (ver §6.4)
- Sino no header com contagem de não-lidos

### 5.10 Audit
- Wrapper em todas operações sensíveis (AP/AR/folha/contratos)
- Tela read-only para admin consultar histórico

---

## 6. Fluxos-Chave

### 6.1 Pipeline de Categorização

```
Novo lancamento sem categoria
        │
        ▼
1. Regra match? ── sim → aplica, metodo=regra, confianca=1.0
        │ não
        ▼
2. Fornecedor já categorizado >3x? ── sim → categoria majoritária,
        │                              metodo=historico, confianca=0.9
        │ não
        ▼
3. Claude Haiku
   input: descricao + valor + lista_categorias + 5 exemplos similares
   output: {categoria_id, confianca, justificativa}
        │
        ├─ confianca > 0.7 → aplica, metodo=llm
        └─ confianca ≤ 0.7 → status=pendente_revisao
```

Tela "Pendências" lista lancamentos sem categoria + sugestões com baixa confiança.
Cada revisão humana pode opcionalmente criar `regra_categorizacao` (modal "criar regra a partir desta?").

**Prompt caching:** sistema + lista de categorias é cacheado (TTL 5min). Volume esperado <50 chamadas/dia.

### 6.2 Conciliação Pluggy ↔ AP/AR

Job roda após cada sync Pluggy:
1. Para cada `lancamento` com `origem=pluggy, conciliado=false`:
2. Busca AP (se saída) ou AR (se entrada) com `status in (previsto, emitido, aprovado)` e:
   - valor igual (± R$ 0,01)
   - data_vencimento entre `lancamento.data - 3` e `lancamento.data + 3`
3. Calcula score:
   - valor exato: +0.5
   - data dentro de ±1 dia: +0.3, ±3 dias: +0.1
   - descrição contém nome do credor/cliente: +0.2
4. Se 1 match com score ≥ 0.8 → vincula automaticamente, atualiza status AR/AP para `recebido`/`pago`
5. Se múltiplos matches OU score < 0.8 → fica em fila "Sugestões de conciliação"

**Invariante:** AP/AR só vira `pago`/`recebido` quando existe `lancamento_id` vinculado (não permite marcar manualmente como pago sem caixa registrado).

### 6.3 Forecast Engine

`gerar_forecast(cenario_id, meses=12)` em Postgres function:

1. **MRR projetado:** começa com MRR atual. Cada mês: `mrr[n] = mrr[n-1] * (1 - churn_pct/100) + novos_clientes_mes * ticket_medio_novo`
2. **Receita de projetos:** distribui `novos_projetos_mes * valor_medio_projeto` linearmente nos meses
3. **Receita real (contratos ativos):** soma AR previstas reais + projeções acima
4. **Despesa projetada:** `(despesas_recorrentes_ativas + folha_atual_total) * (1 + crescimento_despesa_pct/100)^n`
5. **Caixa:** `caixa[n] = caixa[n-1] + receita[n] - despesa[n]`, partindo de `saldo_atual` consolidado
6. **Runway:** primeiro mês onde `caixa < 0`, ou 36+ se não atingir

Materializa em `forecast_projecoes`. UI tem botão "Recalcular" e re-roda on-demand quando driver muda.

### 6.4 Alertas (cron diário 07h)

| Alerta | Condição | Severidade |
|---|---|---|
| Runway crítico | `cenario_base.runway < 6` | critical |
| Runway atenção | `cenario_base.runway < 12` | warning |
| AP atrasada | `data_vencimento < hoje AND status='previsto'` | warning |
| AR atrasada | `data_vencimento < hoje AND status='emitido'` | warning |
| Contrato vencendo | `data_fim BETWEEN hoje+30 AND hoje+60` | info |
| Despesa anômala | `valor > 2 * AVG(categoria, 90d)` | warning |
| Caixa abaixo do mínimo | `SUM(saldos) < threshold_config` | critical |

Email enviado via Resend para admins quando severidade ≥ warning.

### 6.5 Geração de Folha

1. Admin clica "Abrir corrida de [mês]"
2. Sistema calcula `itens_folha` para cada `funcionario` ativo no mês:
   - `salario_bruto = funcionario.salario_base`
   - `beneficios_valor = sum(beneficios_json.valores)`
   - `encargos_valor = salario_bruto * sum(encargos_pct_json) / 100`
   - `liquido_pagar = salario_bruto - inss_funcionario - irrf` (cálculo simplificado, tabelas hardcoded)
3. Status `aberta` permite edição de descontos manuais. Cálculo de INSS/IRRF usa `tabelas_fiscais` do ano corrente (atualização anual manual via tela de config)
4. Admin clica "Fechar corrida":
   - Validação (todos itens calculados, sem erros)
   - Gera APs:
     - 1 AP por funcionário (líquido, vence dia 5 do mês seguinte)
     - 1 AP FGTS (categoria=encargos, vence dia 7)
     - 1 AP INSS (vence dia 20)
     - APs de benefícios externos (VR/VA → operadora)
     - APs de provisão (13º, férias) categorizados separadamente
   - Status `fechada`, grava audit log
   - Gera holerites PDF (template básico CLT) salvos em Storage, registrados em `holerites`

---

## 7. Segurança

### Autenticação
- Supabase Auth com **Magic Link** (sem senha)
- Sessões 7d

### Autorização (3 roles)
- `admin`: tudo, único que pode mudar config, fechar folha, ver holerites de outros, aprovar AP, ver audit log
- `financeiro`: CRUD operacional em AR/AP/lançamentos/clientes/fornecedores; vê próprio holerite; não muda config; não fecha folha
- `leitura`: read-only em tudo exceto folha (que não vê)

### Row Level Security (RLS)
- Habilitado em todas as tabelas
- Policies por role definidas em migration dedicada
- Tabelas sensíveis com regra extra:
  - `itens_folha`: visível só para `admin`, ou para o próprio funcionário (`auth.uid() = funcionario.usuario_id` quando linkado)
  - `audit_log`: só `admin`
  - `holerites`: idem

### Secrets
- Pluggy, Resend, eNotas, Anthropic keys em **Supabase Vault**
- Acessadas só via Edge Functions

### Backup
- Supabase Point-in-Time Recovery (PITR) habilitado
- Job semanal de export CSV completo para Storage (retenção 90d)
- Documentação de restore testada uma vez

### Audit
- Toda mutação em AP/AR/folha/contratos/funcionarios passa por wrapper que grava `audit_log` (user, ação, tabela, before, after, motivo)
- Operações destrutivas (cancelar fatura paga, reabrir folha) exigem motivo obrigatório

---

## 8. Tratamento de Erros

| Cenário | Comportamento |
|---|---|
| Pluggy timeout/falha | Marca job `failed`, retry exponencial (1m, 5m, 15m), alerta admin se falhar definitivamente |
| eNotas falha emissão | AR fica `previsto` com flag `nf_falha`, mostra erro na UI, permite retry manual |
| LLM timeout/erro | Lancamento fica `pendente_revisao` (não bloqueia fluxo) |
| Conciliação ambígua | NUNCA auto-resolve, fica em fila de sugestões |
| Reabrir folha fechada | Exige role admin + motivo, gera audit + reverte APs gerados (estorna se já pagos) |
| Cancelar fatura paga | Exige confirmação + motivo + audit; cria `lancamento` de estorno |
| Input financeiro inválido | Validação Zod (valor > 0, datas válidas, moeda conhecida, CPF/CNPJ válido) → erro 400 |
| Saldo inconsistente | Job de verificação diário: `Σ lancamentos vs saldo_pluggy` → alerta se divergência > R$ 0,01 |

---

## 9. Estratégia de Testes

### Unit (Vitest)
- Lógica pura, sem I/O
- Cobertura mínima 80% em `modules/`
- Alvos críticos:
  - Cálculo de MRR/ARR/NRR/churn
  - Geração de folha (salário, encargos, provisões)
  - Engine de forecast (projeção mês a mês)
  - Matching AP/AR ↔ lancamento (score)
  - Cascata de categorização (mockando LLM)

### Integration (Vitest + Supabase local)
- Fluxos cross-módulo, contra DB real
- Casos-âncora:
  - Criar contrato → gera AR mensal → marcar recebido → vira lancamento → entra fluxo de caixa
  - Abrir folha → fechar folha → APs gerados corretos → pagar APs → lancamentos batem com itens_folha
  - Sync Pluggy mock → conciliação automática → AP atualizado

### E2E (Playwright)
- 3 jornadas críticas:
  1. Login → lançamento manual → categorização → aparece no fluxo
  2. Abrir folha → revisar → fechar → ver APs gerados
  3. Editar driver de cenário → recalcular forecast → ver gráfico atualizado

### Property tests (fast-check)
- Invariantes financeiras (geram centenas de cenários aleatórios):
  - `Σ lancamentos.entrada - Σ lancamentos.saida + saldo_inicial = saldo_atual` por conta
  - `Σ itens_folha.liquido = Σ AP_funcionarios da folha`
  - `Σ valor_milestones = projeto.valor_total`
  - Forecast: `caixa[n] = caixa[n-1] + receita[n] - despesa[n]` exato

### Seeds
- Seed determinístico para dev:
  - 2 clientes (espelhando os reais)
  - 3 funcionários fake (cargos plausíveis)
  - 6 meses de histórico (contratos, faturas pagas, despesas, folhas)
- Usado em testes e demo de vendas

### CI
- GitHub Actions: lint + typecheck + unit + integration em todo PR
- E2E roda em staging (Vercel preview com Supabase preview)
- Deploy automático Vercel por branch

---

## 10. Escopo Fora desta Fase

Explicitamente postergado (criar phases futuras):
- Multi-tenant (virar produto)
- Geração de SPED / DAS / DCTF
- Cobrança por boleto/Pix recorrente automático
- Conciliação de cartão corporativo separada
- Cap table / investidores / vesting
- Previsão de churn com ML
- Aprovação multi-nível em AP
- App mobile

---

## 11. Critérios de Sucesso

Funcional:
- [ ] Founders conseguem fechar mês financeiro sem planilha em <2h
- [ ] Forecast Base bate com realizado dentro de ±15% após 3 meses
- [ ] 100% dos lançamentos categorizados (manual + auto), 0 não-categorizados >30d
- [ ] Folha fechada com 0 erros de cálculo em comparação com calculadora externa
- [ ] Holerite gerado contém todos os campos obrigatórios CLT

Operacional:
- [ ] Sync Pluggy roda diariamente sem intervenção por 30 dias
- [ ] Conciliação automática atinge >70% dos lancamentos sem revisão manual
- [ ] Alertas críticos disparam em <24h do evento
- [ ] Custo mensal de infra <$100

Qualidade:
- [ ] Cobertura de testes ≥80% em `modules/`
- [ ] Zero erros em produção por 7d após cada deploy
- [ ] Audit log preserva 100% das mutações sensíveis

---

## 12. Próximos Passos

1. **Plano de implementação** (próxima skill: writing-plans)
   - Decomposição em phases (sugestão: Setup → Receitas/AR → Despesas/AP → Folha → Bancos/Categorização → Forecast → Dashboard)
2. **Execução por phase** com TDD
3. **Soft launch interno** (1 mês paralelo a planilha atual para validação)
4. **Go-live** quando critérios de sucesso atingidos
