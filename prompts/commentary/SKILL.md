---
name: commentary-mensal
description: Gera comentário executivo 3-5 sentenças sobre variações Forecast vs. realizado
model: claude-haiku-4-5
inputs:
  - mes_ref (date)
  - linhas_variancia (array)
  - thresholds (object)
outputs:
  - resumo (string, 3-5 sentenças)
  - destaques (array de objetos {linha, driver, magnitude})
---

# Objetivo

(A ser preenchido na Fase 5. Pattern de referência: `fund-admin/skills/variance-commentary/SKILL.md`. Materialidade: max(5% da categoria, R$ 50). Explicar driver, não restituir percentual.)

# Inputs

# Procedimento

# Outputs

# Restrições

- Limite 1 chamada/mês (após fechamento) — não ad-hoc
- Sempre em PT-BR
- Nunca inventar números — usar apenas dados de entrada

# Exemplos
