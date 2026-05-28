---
name: reconciliacao-break-classifier
description: Classifica lançamento Pluggy não conciliado em uma das categorias de break
model: claude-haiku-4-5
inputs:
  - lancamento (object)
  - candidatos_ap_ar (array)
outputs:
  - classificacao (enum)
  - melhor_match_id (uuid | null)
  - score (number 0..1)
  - explicacao (string)
---

# Objetivo

(A ser preenchido na Fase 4. Pattern de referência: `fund-admin/skills/break-trace/SKILL.md`. Taxonomia em §13.2 do spec: matched | timing-break | amount-break | mapping-issue | duplicate | bank-only | ledger-only.)

# Inputs

# Procedimento

# Outputs

# Restrições

# Exemplos
