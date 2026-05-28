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

Classificar a relação entre um lançamento bancário (Pluggy) e candidatos de contas a pagar/receber (AP/AR) usando a taxonomia de 7 categorias. O objetivo é identificar se há correspondência, e se não houver, qual tipo de divergência explica a falha.

# Inputs

- `lancamento`: objeto `{id, valor, data, descricao}` — lançamento do banco
- `candidatos_ap_ar`: lista de `{id, tipo, valor, data, descricao}` — candidatos AP ou AR

# Procedimento

1. Compare o valor do lançamento com cada candidato: diferença < R$ 0,01 é match exato.
2. Compare as datas: diferença ≤ 1 dia é match forte; ≤ 3 dias é aceitável.
3. Compare as descrições: tokens comuns (ignora case/pontuação) aumentam confiança.
4. Escolha o melhor candidato por score combinado.
5. Classifique conforme a taxonomia abaixo.

Taxonomia:
- `matched`: valor + data + descrição alinhados (score ≥ 0.8)
- `timing-break`: valor exato, mas data diverge > 3 dias
- `amount-break`: data alinhada, mas valor diverge
- `mapping-issue`: divergência em múltiplos campos sem padrão claro
- `duplicate`: lançamento já conciliado com outro AP/AR (mesmos valor + data + descrição)
- `bank-only`: nenhum candidato AP/AR encontrado
- `ledger-only`: candidato existe mas sem lançamento bancário correspondente (use para relato, nunca retorne isso em resposta a um lançamento)

# Outputs

Retorne **apenas** um JSON no formato:
```json
{"classificacao":"<uma das 7 categorias>","melhor_match_id":"<uuid ou null>","score":<0..1>,"explicacao":"<máx 200 chars, PT-BR>"}
```

# Restrições

- `melhor_match_id` deve ser `null` quando `classificacao` é `bank-only` ou `duplicate`
- Nunca invente um ID que não esteja na lista de candidatos
- Responda sempre em PT-BR
- Sem texto extra além do JSON

# Exemplos

**Exemplo 1 — matched**
- Lançamento: valor=1000.00, data=2026-05-10, descricao="Pix recebido Cliente Acme"
- Candidato AR: id="ar-001", valor=1000.00, data=2026-05-10, descricao="AR Acme contrato mai/26"
- Saída: `{"classificacao":"matched","melhor_match_id":"ar-001","score":0.95,"explicacao":"Valor exato + mesma data + fornecedor Acme identificado em ambos"}`

**Exemplo 2 — timing-break**
- Lançamento: valor=2500.00, data=2026-05-15, descricao="Boleto Fornecedor XYZ"
- Candidato AP: id="ap-002", valor=2500.00, data=2026-05-08, descricao="AP XYZ fatura 0042"
- Saída: `{"classificacao":"timing-break","melhor_match_id":"ap-002","score":0.55,"explicacao":"Valor exato mas pagamento ocorreu 7 dias após vencimento"}`

**Exemplo 3 — bank-only**
- Lançamento: valor=150.00, data=2026-05-20, descricao="TRF PIX 00112233"
- Candidatos: []
- Saída: `{"classificacao":"bank-only","melhor_match_id":null,"score":1.0,"explicacao":"Nenhum AP/AR encontrado para este lançamento — verificar se é despesa não prevista"}`
