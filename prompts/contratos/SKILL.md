---
name: contratos-extracao
description: Extrai termos estruturados de PDF/texto de contrato (AaaS ou projeto)
model: claude-haiku-4-5
inputs:
  - texto_contrato (string)
  - tipo_esperado (enum: aaas | projeto)
outputs:
  - cliente (object)
  - termos (object — tipo-dependente)
  - milestones (array, se projeto)
  - campos_faltantes (array)
---

# Objetivo

(A ser preenchido na Fase 1. Pattern de referência: `operations/skills/kyc-doc-parse/SKILL.md` — null para campos ausentes, lista explícita de gaps.)

# Inputs

# Procedimento

# Outputs

# Restrições

- Nunca inferir CPF/CNPJ — só extrair literal
- Campos faltantes vão para `campos_faltantes`, não para guesses

# Exemplos
