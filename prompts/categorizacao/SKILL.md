---
name: categorizacao-cascata
description: Classifica lançamento financeiro em uma categoria do plano de contas após regras e histórico falharem
model: claude-haiku-4-5
inputs:
  - descricao (string)
  - valor (number)
  - categorias_disponiveis (array)
  - exemplos_recentes (array, opcional)
outputs:
  - categoria_id (uuid)
  - confianca (number 0..1)
  - justificativa (string ≤ 200 chars)
---

# Objetivo

(A ser preenchido na Fase 4. Pattern de referência: `fund-admin/skills/variance-commentary/SKILL.md` — focar em driver, não em parafrasear descrição.)

# Inputs

# Procedimento

# Outputs

# Restrições

- Nunca inventar categoria fora da lista fornecida
- Se incerto (confianca ≤ 0.7), preferir devolver baixa confiança a chutar
- Em PT-BR

# Exemplos

(Few-shot a ser adicionado na Fase 4.)
