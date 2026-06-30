# Botões de editar — wire-up (lote completo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Dar flexibilidade de **edição** ao operador: adicionar botão/fluxo de editar para Milestones (dentro do projeto), Projeto, Clientes, Contratos, Fornecedores, Funcionários, Despesas recorrentes e PJ spot/Alocações. Todas já têm `atualizarX` no módulo e form reutilizável que aceita `initialData` — falta ligar.

**Architecture:** Padrão canônico já existente no repo (`config/regras-categorizacao/[id]/page.tsx`): uma página `[entidade]/[id]/editar/page.tsx` (Server Component) carrega a entidade, define um server action que chama `atualizarX(id, …)` + `redirect`, e renderiza `<XForm initialData={…} onSubmit={action} submitLabel="Salvar alterações" />`. No detalhe da entidade adiciona-se um link "Editar". Milestones e Alocações (que não têm página própria) ganham **edição inline** na página onde já são listadas (padrão `pendencia-row.tsx`).

**Tech Stack:** Next.js 16 (Server Components, Server Actions, `redirect`/`revalidatePath`), forms client em `src/components/forms/*`. **Antes de codar Next, conferir `node_modules/next/dist/docs/` se algo divergir** — mas tudo aqui espelha páginas existentes.

**Sem mudança de backend:** todas as `atualizarX` já existem. Só UI/wiring. Verificação = `npm run build` (lint/tsc) por task.

**Padrão de detalhe → editar:** detail page `[id]/page.tsx` (read-only) ganha link "Editar" → `[id]/editar/page.tsx`.

---

## Entidades e specs (confirmado)

| Entidade | Form component | Módulo `atualizarX` | Detalhe / Novo |
|---|---|---|---|
| Milestone (inline) | — (inline) | `atualizarMilestone` (`receitas/projetos`) | dentro de `receitas/projetos/[id]` |
| Projeto | `forms/projeto-form` (`ProjetoForm`) | `atualizarProjeto` (`receitas/projetos`) | `receitas/projetos/[id]` · `/novo` |
| Cliente | `forms/cliente-form` | `atualizarCliente` (`receitas/clientes`) | `receitas/clientes/[id]` · `/novo` |
| Contrato | `forms/contrato-form` | `atualizarContrato` (`receitas/contratos`) | `receitas/contratos/[id]` · `/novo` |
| Fornecedor | `forms/fornecedor-form` | `atualizarFornecedor` (`despesas/fornecedores`) | `despesas/fornecedores/[id]` · `/novo` |
| Funcionário | `forms/funcionario-form` | `atualizarFuncionario` (`folha/funcionarios`) | `folha/funcionarios/[id]` · `/novo` |
| Recorrente | `forms/recorrente-form` | `atualizarRecorrente` (`despesas/recorrentes`) | `despesas/recorrentes/[id]` · `/novo` |
| PJ spot + Alocação | `forms/pj-spot-form` + `forms/alocacao-form` | `atualizarPJSpot` + `atualizarAlocacao` (`folha/pj-spot`) | `folha/pj-spot/[id]` · `/novo` |

---

## Task 1: Editar Milestone (inline, dentro do projeto)

**Files:**
- Create: `src/components/milestone-row.tsx`
- Modify: `src/app/(dashboard)/receitas/projetos/[id]/page.tsx`

- [ ] **Step 1: Criar `src/components/milestone-row.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type MilestonePatch = {
  ordem: number
  descricao: string
  valor: number
  data_prevista: string
  status: 'pendente' | 'em_andamento' | 'concluido' | 'faturado' | 'pago'
}

export type MilestoneRowData = MilestonePatch & { id: string }

const STATUS_OPTS = ['pendente', 'em_andamento', 'concluido', 'faturado', 'pago'] as const

function badgeVariant(status: string): 'default' | 'secondary' {
  return status === 'concluido' || status === 'faturado' || status === 'pago' ? 'default' : 'secondary'
}

export function MilestoneRow({
  milestone,
  onEditar,
}: {
  milestone: MilestoneRowData
  onEditar: (id: string, patch: MilestonePatch) => Promise<void>
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  const [form, setForm] = useState<MilestonePatch>({
    ordem: milestone.ordem,
    descricao: milestone.descricao,
    valor: milestone.valor,
    data_prevista: milestone.data_prevista,
    status: milestone.status,
  })
  const [err, setErr] = useState<string | null>(null)

  function salvar() {
    setErr(null)
    start(async () => {
      try {
        await onEditar(milestone.id, form)
        setEditing(false)
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  if (!editing) {
    return (
      <tr className="border-t">
        <td className="px-4 py-3 text-muted-foreground">{milestone.ordem}</td>
        <td className="px-4 py-3 font-medium">{milestone.descricao}</td>
        <td className="px-4 py-3 text-muted-foreground">
          R$ {milestone.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{milestone.data_prevista}</td>
        <td className="px-4 py-3"><Badge variant={badgeVariant(milestone.status)}>{milestone.status}</Badge></td>
        <td className="px-4 py-3 text-right">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>Editar</Button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-t bg-muted/30">
      <td className="px-2 py-2">
        <Input type="number" min={1} value={form.ordem}
          onChange={(e) => setForm({ ...form, ordem: parseInt(e.target.value) || 1 })} className="w-16" />
      </td>
      <td className="px-2 py-2">
        <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
      </td>
      <td className="px-2 py-2">
        <Input type="number" min={0} step={0.01} value={form.valor}
          onChange={(e) => setForm({ ...form, valor: parseFloat(e.target.value) || 0 })} className="w-28" />
      </td>
      <td className="px-2 py-2">
        <Input type="date" value={form.data_prevista}
          onChange={(e) => setForm({ ...form, data_prevista: e.target.value })} />
      </td>
      <td className="px-2 py-2">
        <select value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as MilestonePatch['status'] })}
          className="border rounded-md px-2 py-1 text-sm bg-background">
          {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <Button type="button" size="sm" onClick={salvar} disabled={pending}>{pending ? '...' : 'Salvar'}</Button>{' '}
        <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setErr(null) }}>Cancelar</Button>
        {err && <div className="text-xs text-destructive mt-1">{err}</div>}
      </td>
    </tr>
  )
}
```

- [ ] **Step 2: Wire na página `src/app/(dashboard)/receitas/projetos/[id]/page.tsx`**

(a) Imports: trocar o import de projetos para incluir `atualizarMilestone`, e importar o componente + tipo:
```ts
import { buscarProjeto, listarMilestones, criarMilestone, atualizarMilestone } from '@/modules/receitas/projetos'
import { MilestoneRow, type MilestonePatch } from '@/components/milestone-row'
```

(b) Adicionar o server action (junto ao `addMilestone` existente):
```ts
  async function editarMilestoneAction(milestoneId: string, patch: MilestonePatch) {
    'use server'
    await atualizarMilestone(milestoneId, patch)
    revalidatePath(`/receitas/projetos/${id}`)
  }
```

(c) Na `<thead>` da tabela de milestones, adicionar a coluna de ações:
```tsx
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
```

(d) Atualizar o `colSpan` da linha vazia de `5` para `6`:
```tsx
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
```

(e) Substituir o bloco `milestones.map((m) => ( <tr> … </tr> ))` por:
```tsx
              ) : milestones.map((m) => (
                <MilestoneRow
                  key={m.id}
                  milestone={{
                    id: m.id, ordem: m.ordem, descricao: m.descricao,
                    valor: m.valor, data_prevista: m.data_prevista, status: m.status,
                  }}
                  onEditar={editarMilestoneAction}
                />
              ))}
```

- [ ] **Step 3: Build** — Run: `npm run build` — Expected: OK.

- [ ] **Step 4: Commit**
```bash
git add src/components/milestone-row.tsx "src/app/(dashboard)/receitas/projetos/[id]/page.tsx"
git commit -m "feat(projetos): editar milestone inline na pagina do projeto" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Editar Projeto (página canônica + botão) — PADRÃO de referência

**Files:**
- Create: `src/app/(dashboard)/receitas/projetos/[id]/editar/page.tsx`
- Modify: `src/app/(dashboard)/receitas/projetos/[id]/page.tsx` (botão "Editar projeto")

- [ ] **Step 1: Criar a página de edição** `src/app/(dashboard)/receitas/projetos/[id]/editar/page.tsx`

```tsx
import { notFound, redirect } from 'next/navigation'
import { buscarProjeto, atualizarProjeto } from '@/modules/receitas/projetos'
import { listarClientes } from '@/modules/receitas/clientes'
import { ProjetoForm, type ProjetoFormData } from '@/components/forms/projeto-form'

export default async function EditarProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projeto = await buscarProjeto(id)
  if (!projeto) notFound()
  const { data: clientes } = await listarClientes({ status: 'ativo' })

  async function action(formData: ProjetoFormData) {
    'use server'
    await atualizarProjeto(id, {
      cliente_id: formData.cliente_id,
      nome: formData.nome,
      descricao: formData.descricao?.trim() || undefined,
      valor_total: formData.valor_total,
      moeda: formData.moeda as 'BRL' | 'USD' | 'EUR',
      data_inicio: formData.data_inicio,
      data_prevista_fim: formData.data_prevista_fim,
      status: formData.status,
      observacoes: formData.observacoes?.trim() || undefined,
    })
    redirect(`/receitas/projetos/${id}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar projeto</h1>
      <ProjetoForm
        clientes={clientes ?? []}
        initialData={{
          cliente_id: projeto.cliente_id,
          nome: projeto.nome,
          descricao: projeto.descricao ?? undefined,
          valor_total: projeto.valor_total,
          moeda: projeto.moeda,
          data_inicio: projeto.data_inicio,
          data_prevista_fim: projeto.data_prevista_fim,
          status: projeto.status,
          observacoes: projeto.observacoes ?? undefined,
        }}
        onSubmit={action}
        submitLabel="Salvar alterações"
      />
    </div>
  )
}
```

- [ ] **Step 2: Botão "Editar" no detalhe** `src/app/(dashboard)/receitas/projetos/[id]/page.tsx`

No header, transformar o bloco do `<h1>`/badge para incluir um link "Editar projeto" à direita. Localizar:
```tsx
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{projeto.nome}</h1>
          <Badge variant={badgeVariant(projeto.status)}>{projeto.status}</Badge>
        </div>
```
e substituir por:
```tsx
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{projeto.nome}</h1>
          <Badge variant={badgeVariant(projeto.status)}>{projeto.status}</Badge>
          <Link
            href={`/receitas/projetos/${id}/editar`}
            className="ml-auto rounded-md border border-border px-3 py-1.5 text-sm text-primary hover:bg-accent"
          >
            Editar projeto
          </Link>
        </div>
```
(`Link` já está importado nessa página.)

- [ ] **Step 3: Build** — Run: `npm run build` — Expected: OK; rota `/receitas/projetos/[id]/editar` na saída.

- [ ] **Step 4: Commit**
```bash
git add "src/app/(dashboard)/receitas/projetos/[id]/editar/page.tsx" "src/app/(dashboard)/receitas/projetos/[id]/page.tsx"
git commit -m "feat(projetos): pagina de editar projeto + botao no detalhe" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Tasks 3–7: Replicar o padrão (Task 2) por entidade

Para CADA entidade abaixo, **replicar exatamente o padrão da Task 2**:
1. Ler o `/novo/page.tsx` da entidade para copiar o mapeamento `XFormData → atualizarX` (mesmos campos do create) e quais props o form precisa (listas auxiliares, ex.: clientes, fornecedores, categorias).
2. Ler `src/components/forms/<form>.tsx` para os nomes exatos de `XFormData` e `initialData`.
3. Criar `<detalhe>/[id]/editar/page.tsx`: carrega a entidade (`buscar…`/select por id, `notFound()` se ausente), carrega listas auxiliares iguais às do `/novo`, define `action` chamando `atualizarX(id, {…})` + `redirect(<detalhe>/${id})`, renderiza `<XForm initialData={…} onSubmit={action} submitLabel="Salvar alterações" … />`.
4. No `<detalhe>/[id]/page.tsx`, adicionar um link "Editar" → `[id]/editar` (mesmo estilo do botão da Task 2; garantir `import Link from 'next/link'`).
5. `npm run build` (OK) e commit `feat(<área>): editar <entidade> (pagina + botao)`.

- [ ] **Task 3 — Cliente:** form `cliente-form` (`ClienteForm`), `atualizarCliente` de `@/modules/receitas/clientes`, detalhe `receitas/clientes/[id]`, novo `receitas/clientes/novo`.
- [ ] **Task 4 — Contrato:** form `contrato-form`, `atualizarContrato` de `@/modules/receitas/contratos`, detalhe `receitas/contratos/[id]`, novo `receitas/contratos/novo` (precisa lista de clientes, ver o /novo).
- [ ] **Task 5 — Fornecedor:** form `fornecedor-form`, `atualizarFornecedor` de `@/modules/despesas/fornecedores`, detalhe `despesas/fornecedores/[id]`, novo `despesas/fornecedores/novo`.
- [ ] **Task 6 — Funcionário:** form `funcionario-form`, `atualizarFuncionario` de `@/modules/folha/funcionarios`, detalhe `folha/funcionarios/[id]`, novo `folha/funcionarios/novo`. (NÃO mexer em `desligarFuncionario` — é ação separada.)
- [ ] **Task 7 — Recorrente:** form `recorrente-form`, `atualizarRecorrente` de `@/modules/despesas/recorrentes`, detalhe `despesas/recorrentes/[id]`, novo `despesas/recorrentes/novo` (precisa fornecedores + categorias, ver o /novo).

Cada uma: build OK + commit próprio.

---

## Task 8: PJ spot + Alocações

**Files:** `folha/pj-spot/[id]/editar/page.tsx` (novo) + `folha/pj-spot/[id]/page.tsx` (botões).

- [ ] **Step 1:** Ler `folha/pj-spot/[id]/page.tsx` e `folha/pj-spot/novo/page.tsx` para entender como PJ spot e Alocações são exibidos/criados hoje.
- [ ] **Step 2: PJ spot** — criar `folha/pj-spot/[id]/editar/page.tsx` no padrão da Task 2 com `pj-spot-form` + `atualizarPJSpot` (`@/modules/folha/pj-spot`); botão "Editar PJ" no detalhe.
- [ ] **Step 3: Alocações** — na página de detalhe do PJ spot (onde as alocações já são listadas), adicionar edição de cada alocação usando `alocacao-form` (`AlocacaoForm`, com `initialData`) + `atualizarAlocacao`, no estilo mais simples consistente com como já são criadas ali (inline/section ou dialog). Se as alocações forem listadas em tabela, espelhar o padrão inline da Task 1 (`MilestoneRow`).
- [ ] **Step 4:** `npm run build` (OK) + commit `feat(folha): editar PJ spot e alocacoes`.

---

## Task 9: Verificação final

- [ ] **Step 1: Lint/build** — Run: `npm run build` — Expected: OK; rotas `…/[id]/editar` listadas para projetos, clientes, contratos, fornecedores, funcionarios, recorrentes, pj-spot.
- [ ] **Step 2: Unit (sem regressão)** — Run: `npm run test:unit` — Expected: PASS (não houve mudança de lógica/backend).

---

## Notas

- **Zero backend novo:** só wiring de UI sobre `atualizarX` já existentes.
- **Permissão:** segue o que cada `atualizarX` já faz hoje (mesma porta dos fluxos de criar). Não introduzir gate novo nesta leva.
- **Verificação visual logada** (menu/edição reais) fica para o controlador após o deploy — não bloqueia as tasks.
- **Milestone e Alocação** = edição inline (sem página própria), pois não têm rota de detalhe individual.
