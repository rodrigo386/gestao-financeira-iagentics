# Endurecimentos rápidos: guard no atualizarAR + cron 401 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar duas brechas do parecer de segurança: (1) `atualizarAR` (service role) passa a checar o papel internamente (não confia só na server action); (2) os endpoints `/api/cron/*` respondem 401 genérico (não 500) quando o secret falta/está errado.

**Architecture:** Dois helpers server-only pequenos e reusáveis: `requireCanWrite(usuarioId)` (busca a role em `usuarios` via service client, lança se não for admin/financeiro) chamado no topo de `atualizarAR`; `requireCronAuth(request)` (Bearer CRON_SECRET → 401 genérico, com `console.error` no servidor se a env faltar) substituindo o bloco duplicado nos 6 cron routes.

**Tech Stack:** Next.js 16 (route handlers, server actions), Supabase (service client), Vitest.

**Pré-requisitos de teste:** `supabase start` rodando; `SUPABASE_SERVICE_ROLE_KEY` (local) em `.env.local`.

---

## File Structure

**Criar:**
- `src/lib/authz.ts` — `requireCanWrite(usuarioId)` (server-only).
- `src/lib/cron-auth.ts` — `requireCronAuth(request)` (helper de auth dos crons).

**Modificar:**
- `src/modules/contas-receber/ar.ts` — chamar `requireCanWrite` no topo de `atualizarAR`.
- `tests/integration/atualizar-ar.test.ts` — teste: usuário `leitura` é bloqueado.
- `src/app/api/cron/gerar-ar/route.ts`, `.../gerar-ap/route.ts`, `.../sync-pluggy/route.ts`, `.../categorizar-pendentes/route.ts`, `.../conciliar/route.ts`, `.../avaliar-alertas/route.ts` — usar `requireCronAuth`.

---

## Task 1: Guard de papel dentro do `atualizarAR`

**Files:**
- Create: `src/lib/authz.ts`
- Modify: `src/modules/contas-receber/ar.ts`
- Test: `tests/integration/atualizar-ar.test.ts`

- [ ] **Step 1: Adicionar o teste que falha**

Adicionar ao final de `tests/integration/atualizar-ar.test.ts`, **dentro** do `describe('atualizarAR', ...)` (antes do `})` que fecha o describe), o caso:

```ts
  it('bloqueia usuário sem permissão de escrita (leitura)', async () => {
    const d = db()
    const { data: u } = await d.auth.admin.createUser({
      email: `ar-leitura-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`,
      password: 'seed-pass-123', email_confirm: true,
    })
    await d.from('usuarios').upsert({ id: u.user!.id, nome: 'Leitor', role: 'leitura' }, { onConflict: 'id' })
    const { arId } = await seedAR()
    await expect(atualizarAR(arId, { valor: 1234 }, u.user!.id)).rejects.toThrow(/permiss/i)
  })
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/integration/atualizar-ar.test.ts`
Expected: FAIL no novo caso — hoje `atualizarAR` não checa papel, então com role `leitura` ele NÃO lança `/permiss/i` (edita normal).

- [ ] **Step 3: Criar `src/lib/authz.ts`**

```ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Lança se o usuário não tiver permissão de escrita (admin ou financeiro).
 * Defense-in-depth para mutações que usam service role (bypassa RLS) — não
 * confiar apenas no gate da server action chamadora.
 */
export async function requireCanWrite(usuarioId: string): Promise<void> {
  const admin = createServiceClient()
  const { data } = await admin.from('usuarios').select('role').eq('id', usuarioId).single()
  if (!data || !['admin', 'financeiro'].includes(data.role)) {
    throw new Error('sem permissão (requer admin ou financeiro)')
  }
}
```

- [ ] **Step 4: Chamar o guard em `atualizarAR` — `src/modules/contas-receber/ar.ts`**

Adicionar o import no topo do arquivo (junto aos outros imports):
```ts
import { requireCanWrite } from '@/lib/authz'
```

Na função `atualizarAR`, logo após a linha `const parsed = AtualizarARPatch.parse(patch)`, adicionar como primeira ação efetiva:
```ts
  await requireCanWrite(usuarioId)
```

(O resto da função permanece igual: busca o `before`, bloqueia `recebido`, valida vencimento, audita e atualiza.)

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/atualizar-ar.test.ts`
Expected: PASS — todos os casos, incluindo o novo (leitura bloqueado) e os antigos (o `seedUserId` cria role `financeiro`, então `requireCanWrite` passa).

- [ ] **Step 6: Commit**

```bash
git add src/lib/authz.ts src/modules/contas-receber/ar.ts tests/integration/atualizar-ar.test.ts
git commit -m "fix(security): atualizarAR checa papel internamente (requireCanWrite, defense-in-depth)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Cron 401 genérico (helper requireCronAuth)

**Files:**
- Create: `src/lib/cron-auth.ts`
- Modify: os 6 route handlers em `src/app/api/cron/*/route.ts`

- [ ] **Step 1: Criar `src/lib/cron-auth.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'

/**
 * Autentica chamadas de cron via Bearer CRON_SECRET. Retorna uma resposta 401
 * genérica quando o secret falta OU o header está errado — sem distinguir os
 * dois casos para o chamador. Se a env CRON_SECRET não estiver configurada,
 * loga no servidor (ops vê no log) e mesmo assim responde 401.
 * Retorna null quando autorizado.
 */
export function requireCronAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    console.error('cron: CRON_SECRET não configurado — requisição rejeitada')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}
```

- [ ] **Step 2: Substituir o bloco de auth nos 6 cron routes**

Em CADA um destes arquivos:
- `src/app/api/cron/gerar-ar/route.ts`
- `src/app/api/cron/gerar-ap/route.ts`
- `src/app/api/cron/sync-pluggy/route.ts`
- `src/app/api/cron/categorizar-pendentes/route.ts`
- `src/app/api/cron/conciliar/route.ts`
- `src/app/api/cron/avaliar-alertas/route.ts`

**(a)** Adicionar o import (junto aos imports existentes, que já incluem `NextRequest, NextResponse` de `next/server`):
```ts
import { requireCronAuth } from '@/lib/cron-auth'
```

**(b)** Localizar o bloco idêntico (dentro do handler, no começo):
```ts
  const expected = process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
```
e substituir por:
```ts
  const naoAutorizado = requireCronAuth(request)
  if (naoAutorizado) return naoAutorizado
```

(Manter todo o resto de cada route inalterado. `NextResponse` continua importado e usado nas respostas de sucesso/erro, então não remover esse import.)

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build OK; nenhum route com `CRON_SECRET not configured` restante.

Run: `grep -rn "CRON_SECRET not configured" src/`
Expected: nenhum resultado (todos migrados).

- [ ] **Step 4: Commit**

```bash
git add src/lib/cron-auth.ts "src/app/api/cron"
git commit -m "fix(security): cron responde 401 generico sem secret valido (helper requireCronAuth)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Verificação final

- [ ] **Step 1: Suíte unitária**

Run: `npm run test:unit`
Expected: PASS (sem regressão).

- [ ] **Step 2: Teste de integração do atualizarAR**

Run: `npx vitest run tests/integration/atualizar-ar.test.ts`
Expected: PASS (incluindo o caso "leitura bloqueado").

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Confirmar a migração dos crons**

Run: `grep -rn "CRON_SECRET not configured" src/`
Expected: nenhum resultado.

---

## Notas

- Sem mudança de comportamento para quem já estava autorizado: admin/financeiro seguem editando AR; crons com o Bearer correto seguem funcionando.
- `requireCanWrite` é reusável para futuras mutações service-role que recebam um `usuarioId`.
- O cron passa a devolver 401 mesmo quando `CRON_SECRET` falta no ambiente; o `console.error` no servidor sinaliza a má-configuração pra ops sem vazar pro chamador.
