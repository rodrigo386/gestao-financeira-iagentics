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

Determinar a **causa econômica** de um lançamento financeiro — não descrever o que está escrito, mas explicar por que a despesa ou receita ocorreu. Exemplo: "AWS *Cloud Services" → driver é infraestrutura de nuvem, não "um pagamento à AWS".

# Inputs

- `descricao`: texto do extrato bancário
- `valor`: valor em reais (R$)
- `categorias_disponiveis`: lista de objetos `{id, nome}` com as categorias do plano de contas
- `exemplos_recentes` (opcional): lançamentos anteriores já categorizados, formato `{descricao, categoria_id}`

# Procedimento

1. Leia a descrição e identifique o fornecedor ou natureza da transação.
2. Analise o driver econômico: é infra? aluguel? folha? receita de cliente?
3. Compare com as categorias disponíveis — escolha a que melhor representa o driver, não o nome do fornecedor.
4. Se exemplos recentes existirem e o fornecedor for o mesmo, priorize a categoria já usada anteriormente.
5. Defina confiança: alta (>0.8) quando o match é claro; baixa (<0.7) quando ambíguo.

# Outputs

Retorne **apenas** um JSON no formato:
```json
{"categoria_id": "<uuid da lista ou null>", "confianca": <0..1>, "justificativa": "<máx 200 chars, PT-BR>"}
```

# Restrições

- Nunca invente ou use uma categoria fora da lista `categorias_disponiveis`
- Materiality: para valores < R$ 50 ou > max(5% da categoria, R$ 50), baixa precisão é aceitável — prefira confiança honesta a chutar
- Se incerto (confiança ≤ 0.7), devolva a melhor tentativa com confiança baixa; não invente
- Responda sempre em PT-BR
- Sem texto extra além do JSON

# Exemplos

**Exemplo 1**
- Entrada: descricao="AWS *Cloud Services Oct", valor=1450.00, categorias=[{id:"cat-001",nome:"Tecnologia/Cloud"},{id:"cat-002",nome:"Operacional/Aluguel"}]
- Saída: `{"categoria_id":"cat-001","confianca":0.95,"justificativa":"AWS é infraestrutura de nuvem — driver é custo de cloud computing"}`

**Exemplo 2**
- Entrada: descricao="Pagamento aluguel Faria Lima nov/2026", valor=8500.00, categorias=[{id:"cat-001",nome:"Tecnologia/Cloud"},{id:"cat-002",nome:"Operacional/Aluguel"},{id:"cat-003",nome:"Outros"}]
- Saída: `{"categoria_id":"cat-002","confianca":0.97,"justificativa":"Descrição explicita aluguel de escritório — driver é custo fixo imobiliário"}`

**Exemplo 3**
- Entrada: descricao="TRF PIX 9182736", valor=320.00, categorias=[{id:"cat-001",nome:"Tecnologia/Cloud"},{id:"cat-002",nome:"Operacional/Aluguel"},{id:"cat-003",nome:"Outros"}]
- Saída: `{"categoria_id":"cat-003","confianca":0.35,"justificativa":"Transferência Pix sem fornecedor identificável — classificação incerta"}`
