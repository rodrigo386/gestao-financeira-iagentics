# Editar AR + índice /config + relatório DRE — Design

**Data:** 2026-05-31
**Status:** aprovado (aguardando review do spec)

## Objetivo

Três entregas pedidas pelo usuário, na mesma frente:
1. **Editar Conta a Receber** (datas + valor + status) para ajustar manualmente realidade × planejado.
2. **Corrigir o 404 de `/config`** ("Configurações") com uma página índice.
3. **Corrigir o 404 de `/relatorios`** com um relatório **DRE realizada (caixa)** + export CSV.

## Contexto atual

- AR é listada por [src/components/ar-table.tsx](../../../src/components/ar-table.tsx) (somente leitura). [src/modules/contas-receber/ar.ts](../../../src/modules/contas-receber/ar.ts) tem `criarAR`, `marcarRecebido`, `cancelarAR`, `gerarARMes`, `inserirARBatch` — **não** há `atualizarAR`. Padrão de mutação sensível: server client autenticado (`createClient`) + `withAudit(usuarioId, ...)`. Gate de papel resolvido na camada de app (sessão → `usuarios.role`).
- Schema AR ([src/lib/schemas/ar.ts](../../../src/lib/schemas/ar.ts)): `data_emissao`/`data_vencimento` (YYYY-MM-DD), `valor` (Money > 0), `status` enum `previsto|emitido|recebido|atrasado|cancelado`; regra `data_vencimento >= data_emissao`.
- `/config` não tem `page.tsx` (só sub-rotas `bancos`, `regras-categorizacao`, `usuarios`) → 404. `/relatorios` não existe → 404. Ambos estão no NAV do [sidebar](../../../src/components/sidebar.tsx).
- `lancamentos` ([src/modules/despesas/lancamentos.ts](../../../src/modules/despesas/lancamentos.ts)): movimento de caixa realizado — `data`, `valor`, `tipo` (`entrada|saida|transferencia`), `categoria_id`, join `categoria:categorias(nome)`. Fluxo de Caixa já agrega lançamentos.
- Papéis: `admin`, `financeiro`, `leitura`; `can_write()` = admin ou financeiro.

## A) Editar Conta a Receber

**Módulo** — `atualizarAR(id, patch, usuarioId)` em `ar.ts`:
- `patch`: `{ data_emissao?, data_vencimento?, valor?, status? }` (todos opcionais; aplica só o que vier).
- Carrega o registro atual; **rejeita** se `status` atual é `recebido` (liquidado com lançamento — sairia de sincronia). Mensagem: "AR recebida não pode ser editada; cancele o recebimento primeiro".
- Faz merge do patch sobre o atual e valida: `valor > 0`; `data_vencimento >= data_emissao`; `status` novo ∈ `{previsto, emitido, atrasado, cancelado}` (rejeita `recebido` via esta função).
- Persiste via server client autenticado (RLS) e envolve em `withAudit` (acao `update`, tabela `contas_a_receber`, before/after).
- Retorna o registro atualizado.

**UI** — edição por linha na tabela de AR:
- A `ARTable` passa a renderizar uma coluna "Ações" com botão **Editar** por linha. Botão fica desabilitado quando `status === 'recebido'` (com tooltip/legenda).
- Clicar abre um **Dialog** (componente `@/components/ui/dialog`) com: emissão (`date`), vencimento (`date`), valor (`number`), status (`select` com previsto/emitido/atrasado/cancelado). Botão Salvar.
- Como a tabela hoje é server-rendered, extrai-se um componente client (ex.: `ar-row-actions.tsx` ou uma versão client da tabela) que recebe `onEditar(id, patch)` (server action) via props.
- A página `/contas-receber` define `editarARAction(id, patch)` `'use server'`: resolve o usuário da sessão, exige `role ∈ {admin, financeiro}`, chama `atualizarAR`, `revalidatePath('/contas-receber')`.

**Erros**: validação (vencimento < emissão, valor ≤ 0) e regra de negócio (editar recebido) propagam mensagem PT-BR pro Dialog. Conflito de índice único (ex.: mudar emissão p/ mês que já tem AR do mesmo contrato) → mensagem clara.

## B) Índice /config

`src/app/(dashboard)/config/page.tsx` (server component):
- Resolve a sessão → `usuarios.role` (para condicionar o card de Usuários a admin).
- Renderiza cards/links: **Bancos** (`/config/bancos`), **Regras de Categorização** (`/config/regras-categorizacao`), e **Usuários** (`/config/usuarios`, só se admin). Título "Configurações", tema dark, padrão das demais páginas.

## C) Relatório DRE (realizada/caixa) + CSV

**Módulo** — `src/modules/relatorios/dre.ts`:
- `calcularDRE(mesRef: string)` onde `mesRef` = `YYYY-MM-01`. Busca `lancamentos` com `data` entre o 1º e o último dia do mês.
- Agrupa por **categoria** (nome; lançamentos sem categoria → "Sem categoria"): `tipo='entrada'` → **receitas**, `tipo='saida'` → **despesas**. **Exclui** `tipo='transferencia'`.
- Retorna `{ mesRef, receitas: {categoria, total}[], despesas: {categoria, total}[], totalReceitas, totalDespesas, resultado }` (resultado = totalReceitas − totalDespesas). Listas ordenadas por total desc.
- Tipo exportado `DRE`.

**Página** — `src/app/(dashboard)/relatorios/page.tsx` (server):
- Lê `?month=YYYY-MM` (default mês atual). Seletor de mês (client) que navega via querystring.
- Chama `calcularDRE`, renderiza: seção **Receitas** (categoria → valor, subtotal verde), seção **Despesas** (categoria → valor, subtotal vermelho), e **Resultado** (verde se ≥ 0, vermelho se < 0).
- Botão **Exportar CSV** apontando para `/api/relatorios/dre.csv?month=YYYY-MM`.

**Export** — `src/app/api/relatorios/dre.csv/route.ts` (`GET`):
- Protegido pelo middleware (não está em `PUBLIC_PATHS`). Lê `?month`, chama `calcularDRE`, devolve `text/csv` com `Content-Disposition: attachment; filename="dre-YYYY-MM.csv"`.
- CSV: colunas `Seção,Categoria,Valor`; linhas de receitas, despesas, e linhas de total/resultado. Valores com 2 casas, ponto decimal (CSV neutro).

## Testes

- **`atualizarAR`** (integração): edita datas/valor/status de uma AR `previsto`; rejeita editar AR `recebido`; rejeita `data_vencimento < data_emissao`; rejeita `valor <= 0`; grava `audit_log`.
- **`calcularDRE`** (integração): cria lançamentos entrada+saída+transferência num mês; confere agrupamento por categoria, `totalReceitas`/`totalDespesas`/`resultado`, e que transferência é ignorada; lançamento fora do mês não entra.
- **Build** verde; suíte existente (unit + integração) sem regressão.

## Restrições e decisões

- AR `recebido` é imutável por `atualizarAR` (reabrir = cancelar recebimento, fora de escopo).
- DRE é **realizada/caixa** (lançamentos), não competência. Mês único (não intervalo).
- Export **CSV** apenas (sem PDF nesta entrega).
- Gate: editar AR e gerar relatório exigem usuário autenticado; **editar AR** exige `admin|financeiro`. Ver relatórios/`/config`: qualquer autenticado (Usuários só admin).

## Fora de escopo

- DRE por competência, DRE por intervalo de meses, export PDF.
- Reabrir AR recebida / desfazer lançamento.
- Edição inline (escolhido Dialog).
