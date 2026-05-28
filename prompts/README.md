# Prompts — Biblioteca versionada

Padrão adotado de [anthropics/financial-services](https://github.com/anthropics/financial-services/tree/main/plugins/vertical-plugins).

## Convenção

- Cada domínio tem uma pasta com um `SKILL.md` principal
- `SKILL.md` começa com frontmatter YAML (`name`, `description`, `model`, `inputs`, `outputs`)
- Corpo segue estrutura: Objetivo → Inputs → Procedimento → Outputs → Restrições → Exemplos
- Prompts em **PT-BR** (público interno IAgentics)
- Mudanças passam por code review como código

## Domínios

| Pasta | Usado por | Preenchido na fase |
|---|---|---|
| `categorizacao/` | módulo Categorizador (cascata regras→histórico→LLM) | Fase 4 |
| `reconciliacao/` | classificação de breaks Pluggy ↔ AP/AR | Fase 4 |
| `commentary/` | narrativa mensal Forecast vs. realizado | Fase 5 |
| `folha/` | validação de cálculo de corrida de folha | Fase 3 |
| `contratos/` | extração estruturada de termos de contrato | Fase 1 |

## Segurança LLM

Toda chamada Claude passa pelo wrapper em `src/lib/llm/` (introduzido na Fase 4). O wrapper é **read-only orchestrator / write-only leaf**: o LLM retorna apenas classificação/texto/JSON; escritas em Supabase ocorrem só em handlers server-side validados. Documentos não-confiáveis (extratos, NFs) nunca entram em contexto com permissão de escrita.
