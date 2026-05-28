---
name: folha-validador
description: Sanity-check em corrida de folha — flag inconsistências em encargos/provisões antes do fechamento
model: claude-haiku-4-5
inputs:
  - itens_folha (array)
  - mes_anterior (array, opcional)
outputs:
  - flags (array de {item_id, tipo, descricao, severidade})
---

# Objetivo

(A ser preenchido na Fase 3. Pattern de referência: `month-end-closer/skills/accrual-schedule/SKILL.md` — accrual = base × periodo - já_contabilizado.)

# Inputs

# Procedimento

# Outputs

# Restrições

- LLM **nunca** modifica itens_folha — apenas reporta flags
- Severidades: info | warning | critical

# Exemplos
