---
name: commentary-mensal
description: Gera comentário executivo 3-5 sentenças sobre variações mês-a-mês (MoM), enquadradas em crescimento de MRR, burn e runway
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
