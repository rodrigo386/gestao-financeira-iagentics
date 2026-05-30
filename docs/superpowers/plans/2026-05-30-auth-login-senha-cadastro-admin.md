# Login por senha + cadastro gerido pelo admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o login por magic link (depende de SMTP, ausente no deploy) por login com e-mail + senha, com contas criadas exclusivamente por um admin numa tela interna.

**Architecture:** Camada de domínio testável em `src/modules/usuarios/` com funções que recebem o `actor` explicitamente e usam o service role (padrão `executarAcao` do copiloto). A camada de app (`/config/usuarios`) resolve o usuário/role da sessão e chama o módulo. Login passa a `signInWithPassword` (browser client cookie-based → middleware enxerga). Auto-cadastro bloqueado em duas camadas: sem página pública + `enable_signup=false` no Supabase. Primeiro admin criado por script de bootstrap idempotente.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (`@supabase/ssr` + `@supabase/supabase-js` admin API), zod, Vitest (integration), Tailwind/shadcn.

**Spec:** [docs/superpowers/specs/2026-05-30-auth-login-senha-cadastro-admin-design.md](../specs/2026-05-30-auth-login-senha-cadastro-admin-design.md)

**Pré-requisitos para rodar os testes de integração:** `supabase start` rodando localmente e `SUPABASE_SERVICE_ROLE_KEY` (chave LOCAL, de `supabase status`) disponível no ambiente (o `tests/integration/setup.ts` carrega `.env.local`). Cada arquivo de teste de integração roda `supabase db reset` no `beforeAll`.

---

## File Structure

**Criar:**
- `src/modules/usuarios/types.ts` — schemas zod + tipos (`CriarUsuarioInput`, `RoleAtribuivel`, `Actor`, `UsuarioListItem`).
- `src/modules/usuarios/usuarios.ts` — funções de domínio (service role + audit + guard admin): `listarUsuarios`, `criarUsuario`, `redefinirSenha`, `trocarRole`, `removerUsuario`.
- `scripts/bootstrap-admin-core.mjs` — `bootstrapAdmin({url,serviceKey,email,password,nome})` idempotente (testável).
- `scripts/bootstrap-admin.mjs` — CLI: lê env e chama o core.
- `src/app/(dashboard)/config/usuarios/page.tsx` — página admin-only + server actions que resolvem o actor da sessão.
- `src/components/usuarios/usuario-create-form.tsx` — form client de criação (useState).
- `src/components/usuarios/usuarios-table.tsx` — tabela client + ações por linha.
- `tests/integration/usuarios.test.ts` — testes do módulo.
- `tests/integration/bootstrap-admin.test.ts` — idempotência do bootstrap.

**Modificar:**
- `src/app/login/page.tsx` — `signInWithPassword`.
- `src/app/auth/callback/route.ts` — remover bootstrap, manter troca de code mínima.
- `supabase/config.toml` — `enable_signup = false` (em `[auth]` e `[auth.email]`).
- `src/components/sidebar.tsx` — item "Usuários" admin-only (prop `isAdmin`).
- `src/app/(dashboard)/layout.tsx` — buscar role e passar `isAdmin` ao Sidebar.
- `package.json` — script `"bootstrap:admin"`.
- `tests/integration/first-login.test.ts` — remover (substituído pelo bootstrap-admin.test.ts).
- `README.md` — documentar login por senha + bootstrap.

**Constantes reutilizadas nos testes** (chaves LOCAIS do Supabase demo, seguras em repo):
- `SUPABASE_URL` local: `http://127.0.0.1:54321`
- ANON local: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`

---

## Task 1: Módulo usuarios — tipos + criarUsuario + listarUsuarios

**Files:**
- Create: `src/modules/usuarios/types.ts`
- Create: `src/modules/usuarios/usuarios.ts`
- Test: `tests/integration/usuarios.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/integration/usuarios.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { criarUsuario, listarUsuarios } from '@/modules/usuarios/usuarios'

// O módulo usa createServiceClient, que lê estas envs. Forçar LOCAL.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'

const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

function db() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Cria um usuário auth + linha usuarios com a role pedida; devolve um Actor válido.
async function makeUser(role: 'admin' | 'financeiro' | 'leitura') {
  const d = db()
  const email = `${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@iagentics.test`
  const { data, error } = await d.auth.admin.createUser({ email, password: 'seed-pass-123', email_confirm: true })
  if (error || !data.user) throw new Error(error?.message)
  const id = data.user.id
  await d.from('usuarios').upsert({ id, nome: role, role }, { onConflict: 'id', ignoreDuplicates: false })
  return { id, role, email }
}

describe('criarUsuario', () => {
  it('bloqueia chamador não-admin', async () => {
    const leitura = await makeUser('leitura')
    await expect(
      criarUsuario({ email: `x-${Date.now()}@iagentics.test`, senha: 'senha-1234', nome: 'X', role: 'leitura' }, { id: leitura.id, role: 'leitura' }),
    ).rejects.toThrow(/admin/i)
  })

  it('admin cria usuário com auth + linha usuarios e login por senha funciona', async () => {
    const admin = await makeUser('admin')
    const email = `novo-${Date.now()}@iagentics.test`
    const { id } = await criarUsuario({ email, senha: 'senha-1234', nome: 'Novo', role: 'financeiro' }, { id: admin.id, role: 'admin' })

    const { data: row } = await db().from('usuarios').select('nome, role').eq('id', id).single()
    expect(row?.role).toBe('financeiro')
    expect(row?.nome).toBe('Novo')

    const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: signIn, error } = await anon.auth.signInWithPassword({ email, password: 'senha-1234' })
    expect(error).toBeNull()
    expect(signIn.session).not.toBeNull()
  })

  it('rejeita role=admin na criação', async () => {
    const admin = await makeUser('admin')
    await expect(
      // @ts-expect-error role inválida de propósito
      criarUsuario({ email: `a-${Date.now()}@iagentics.test`, senha: 'senha-1234', nome: 'A', role: 'admin' }, { id: admin.id, role: 'admin' }),
    ).rejects.toThrow()
  })
})

describe('listarUsuarios', () => {
  it('admin vê usuários com e-mail; não-admin é bloqueado', async () => {
    const admin = await makeUser('admin')
    const lista = await listarUsuarios({ id: admin.id, role: 'admin' })
    expect(lista.some((u) => u.email && u.role)).toBe(true)
    await expect(listarUsuarios({ id: admin.id, role: 'leitura' })).rejects.toThrow(/admin/i)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/integration/usuarios.test.ts`
Expected: FAIL com erro de import (`@/modules/usuarios/usuarios` não existe).

- [ ] **Step 3: Criar `src/modules/usuarios/types.ts`**

```ts
import { z } from 'zod'

export const ROLES_ATRIBUIVEIS = ['financeiro', 'leitura'] as const
export type RoleAtribuivel = (typeof ROLES_ATRIBUIVEIS)[number]

export const CriarUsuarioSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  nome: z.string().min(1, 'Nome obrigatório'),
  role: z.enum(ROLES_ATRIBUIVEIS),
})
export type CriarUsuarioInput = z.infer<typeof CriarUsuarioSchema>

export const RedefinirSenhaSchema = z.object({
  userId: z.string().uuid(),
  novaSenha: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
})
export type RedefinirSenhaInput = z.infer<typeof RedefinirSenhaSchema>

export const TrocarRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES_ATRIBUIVEIS),
})
export type TrocarRoleInput = z.infer<typeof TrocarRoleSchema>

export type Actor = { id: string; role: string }

export type UsuarioListItem = {
  id: string
  nome: string
  role: string
  email: string | null
}
```

- [ ] **Step 4: Criar `src/modules/usuarios/usuarios.ts` (apenas listarUsuarios + criarUsuario nesta task)**

```ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { withAudit } from '@/lib/audit'
import {
  CriarUsuarioSchema,
  type CriarUsuarioInput,
  type Actor,
  type UsuarioListItem,
} from './types'

function requireAdmin(actor: Actor) {
  if (actor.role !== 'admin') throw new Error('apenas admin pode gerenciar usuários')
}

export async function listarUsuarios(actor: Actor): Promise<UsuarioListItem[]> {
  requireAdmin(actor)
  const admin = createServiceClient()
  const { data: rows, error } = await admin.from('usuarios').select('id, nome, role').order('nome')
  if (error) throw new Error(`listarUsuarios: ${error.message}`)
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const emailById = new Map((list?.users ?? []).map((u) => [u.id, u.email ?? null]))
  return (rows ?? []).map((r) => ({ id: r.id, nome: r.nome, role: r.role, email: emailById.get(r.id) ?? null }))
}

export async function criarUsuario(input: CriarUsuarioInput, actor: Actor): Promise<{ id: string }> {
  requireAdmin(actor)
  const { email, senha, nome, role } = CriarUsuarioSchema.parse(input)
  const admin = createServiceClient()

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  })
  if (createErr || !created.user) throw new Error(`criarUsuario: ${createErr?.message ?? 'falha ao criar'}`)
  const id = created.user.id

  return withAudit(
    {
      usuario_id: actor.id,
      acao: 'insert',
      tabela: 'usuarios',
      registro_id: id,
      before: null,
      after: { nome, role, email },
      motivo: 'admin: criar usuário',
    },
    async () => {
      const { error } = await admin.from('usuarios').insert({ id, nome, role })
      if (error) {
        // limpa o auth user órfão para que re-tentativas fiquem limpas
        await admin.auth.admin.deleteUser(id)
        throw new Error(`criarUsuario (usuarios): ${error.message}`)
      }
      return { id }
    },
  )
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/integration/usuarios.test.ts`
Expected: PASS (4 testes verdes).

- [ ] **Step 6: Commit**

```bash
git add src/modules/usuarios/types.ts src/modules/usuarios/usuarios.ts tests/integration/usuarios.test.ts
git commit -m "feat(usuarios): módulo criarUsuario + listarUsuarios (admin-gated, service role + audit)"
```

---

## Task 2: Módulo usuarios — redefinirSenha + trocarRole + removerUsuario

**Files:**
- Modify: `src/modules/usuarios/usuarios.ts`
- Test: `tests/integration/usuarios.test.ts` (adicionar describe)

- [ ] **Step 1: Adicionar os testes que falham**

Adicionar ao final de `tests/integration/usuarios.test.ts` (a função `makeUser` e os imports do topo já existem; estender o import da linha 3):

Trocar a linha de import existente por:
```ts
import { criarUsuario, listarUsuarios, redefinirSenha, trocarRole, removerUsuario } from '@/modules/usuarios/usuarios'
```

Adicionar os describes:
```ts
describe('redefinirSenha', () => {
  it('admin redefine a senha e o usuário loga com a nova', async () => {
    const admin = await makeUser('admin')
    const email = `pw-${Date.now()}@iagentics.test`
    const { id } = await criarUsuario({ email, senha: 'senha-antiga-1', nome: 'PW', role: 'leitura' }, { id: admin.id, role: 'admin' })

    await redefinirSenha({ userId: id, novaSenha: 'senha-nova-9' }, { id: admin.id, role: 'admin' })

    const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await anon.auth.signInWithPassword({ email, password: 'senha-nova-9' })
    expect(error).toBeNull()
  })
})

describe('trocarRole', () => {
  it('troca entre financeiro/leitura e bloqueia mexer no admin', async () => {
    const admin = await makeUser('admin')
    const email = `role-${Date.now()}@iagentics.test`
    const { id } = await criarUsuario({ email, senha: 'senha-1234', nome: 'R', role: 'leitura' }, { id: admin.id, role: 'admin' })

    await trocarRole({ userId: id, role: 'financeiro' }, { id: admin.id, role: 'admin' })
    const { data: row } = await db().from('usuarios').select('role').eq('id', id).single()
    expect(row?.role).toBe('financeiro')

    // não pode alterar a role do admin
    await expect(trocarRole({ userId: admin.id, role: 'leitura' }, { id: admin.id, role: 'admin' })).rejects.toThrow(/admin/i)
  })
})

describe('removerUsuario', () => {
  it('remove auth + linha usuarios; bloqueia remover a si mesmo e o admin', async () => {
    const admin = await makeUser('admin')
    const email = `rm-${Date.now()}@iagentics.test`
    const { id } = await criarUsuario({ email, senha: 'senha-1234', nome: 'RM', role: 'leitura' }, { id: admin.id, role: 'admin' })

    await removerUsuario(id, { id: admin.id, role: 'admin' })
    const { data: row } = await db().from('usuarios').select('id').eq('id', id).maybeSingle()
    expect(row).toBeNull()

    await expect(removerUsuario(admin.id, { id: admin.id, role: 'admin' })).rejects.toThrow(/si mesmo/i)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/integration/usuarios.test.ts`
Expected: FAIL — `redefinirSenha`/`trocarRole`/`removerUsuario` não exportados.

- [ ] **Step 3: Adicionar as funções em `src/modules/usuarios/usuarios.ts`**

Estender o import do topo do arquivo:
```ts
import {
  CriarUsuarioSchema,
  RedefinirSenhaSchema,
  TrocarRoleSchema,
  type CriarUsuarioInput,
  type RedefinirSenhaInput,
  type TrocarRoleInput,
  type Actor,
  type UsuarioListItem,
} from './types'
```

Adicionar ao final do arquivo:
```ts
export async function redefinirSenha(input: RedefinirSenhaInput, actor: Actor): Promise<void> {
  requireAdmin(actor)
  const { userId, novaSenha } = RedefinirSenhaSchema.parse(input)
  const admin = createServiceClient()
  await withAudit(
    {
      usuario_id: actor.id,
      acao: 'update',
      tabela: 'usuarios',
      registro_id: userId,
      before: null,
      after: { senha: '***' },
      motivo: 'admin: redefinir senha',
    },
    async () => {
      const { error } = await admin.auth.admin.updateUserById(userId, { password: novaSenha })
      if (error) throw new Error(`redefinirSenha: ${error.message}`)
    },
  )
}

export async function trocarRole(input: TrocarRoleInput, actor: Actor): Promise<void> {
  requireAdmin(actor)
  const { userId, role } = TrocarRoleSchema.parse(input)
  const admin = createServiceClient()
  const { data: alvo } = await admin.from('usuarios').select('role').eq('id', userId).single()
  if (alvo?.role === 'admin') throw new Error('não é possível alterar a role do admin')
  await withAudit(
    {
      usuario_id: actor.id,
      acao: 'update',
      tabela: 'usuarios',
      registro_id: userId,
      before: { role: alvo?.role ?? null },
      after: { role },
      motivo: 'admin: trocar role',
    },
    async () => {
      const { error } = await admin.from('usuarios').update({ role }).eq('id', userId)
      if (error) throw new Error(`trocarRole: ${error.message}`)
    },
  )
}

export async function removerUsuario(userId: string, actor: Actor): Promise<void> {
  requireAdmin(actor)
  if (userId === actor.id) throw new Error('não é possível remover a si mesmo')
  const admin = createServiceClient()
  const { data: alvo } = await admin.from('usuarios').select('role').eq('id', userId).single()
  if (alvo?.role === 'admin') throw new Error('não é possível remover o admin')
  await withAudit(
    {
      usuario_id: actor.id,
      acao: 'delete',
      tabela: 'usuarios',
      registro_id: userId,
      before: { role: alvo?.role ?? null },
      after: null,
      motivo: 'admin: remover usuário',
    },
    async () => {
      // ordem determinística: linha usuarios primeiro, depois o auth user
      const { error: delRow } = await admin.from('usuarios').delete().eq('id', userId)
      if (delRow) throw new Error(`removerUsuario (usuarios): ${delRow.message}`)
      const { error: delAuth } = await admin.auth.admin.deleteUser(userId)
      if (delAuth) throw new Error(`removerUsuario (auth): ${delAuth.message}`)
    },
  )
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/usuarios.test.ts`
Expected: PASS (todos os describes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/usuarios/usuarios.ts tests/integration/usuarios.test.ts
git commit -m "feat(usuarios): redefinirSenha + trocarRole + removerUsuario (admin-gated)"
```

---

## Task 3: Bootstrap do primeiro admin (core + script + teste)

**Files:**
- Create: `scripts/bootstrap-admin-core.mjs`
- Create: `scripts/bootstrap-admin.mjs`
- Modify: `package.json`
- Test: `tests/integration/bootstrap-admin.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/integration/bootstrap-admin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { bootstrapAdmin } from '../../scripts/bootstrap-admin-core.mjs'

const URL = 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe('bootstrapAdmin', () => {
  it('é idempotente e resulta em exatamente um admin', async () => {
    const email = `boot-${Date.now()}@iagentics.test`

    const r1 = await bootstrapAdmin({ url: URL, serviceKey: KEY, email, password: 'senha-inicial-1', nome: 'Boot' })
    expect(r1.status).toBe('created')

    const r2 = await bootstrapAdmin({ url: URL, serviceKey: KEY, email, password: 'senha-nova-2', nome: 'Boot' })
    expect(r2.status).toBe('password-updated')
    expect(r2.userId).toBe(r1.userId)

    const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { count } = await db.from('usuarios').select('id', { count: 'exact', head: true }).eq('role', 'admin')
    expect(count).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run tests/integration/bootstrap-admin.test.ts`
Expected: FAIL — `scripts/bootstrap-admin-core.mjs` não existe.

- [ ] **Step 3: Criar `scripts/bootstrap-admin-core.mjs`**

```js
import { createClient } from '@supabase/supabase-js'

/**
 * Cria (ou define a senha de) o primeiro admin e garante sua linha em usuarios.
 * Idempotente: re-rodar atualiza a senha e mantém um único admin.
 * @returns {Promise<{ status: 'created'|'password-updated', userId: string }>}
 */
export async function bootstrapAdmin({ url, serviceKey, email, password, nome }) {
  if (!url || !serviceKey) throw new Error('url e serviceKey obrigatórios')
  if (!email || !password) throw new Error('email e password obrigatórios')

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) throw new Error(`listUsers: ${listErr.message}`)
  const existing = (list?.users ?? []).find((u) => u.email === email)

  let userId
  let status
  if (!existing) {
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome: nome ?? 'Admin' },
    })
    if (error || !created.user) throw new Error(`createUser: ${error?.message ?? 'falhou'}`)
    userId = created.user.id
    status = 'created'
  } else {
    const { error } = await db.auth.admin.updateUserById(existing.id, { password })
    if (error) throw new Error(`updateUserById: ${error.message}`)
    userId = existing.id
    status = 'password-updated'
  }

  const { error: upErr } = await db
    .from('usuarios')
    .upsert({ id: userId, nome: nome ?? 'Admin', role: 'admin' }, { onConflict: 'id', ignoreDuplicates: false })
  if (upErr) throw new Error(`upsert usuarios: ${upErr.message}`)

  return { status, userId }
}
```

- [ ] **Step 4: Criar `scripts/bootstrap-admin.mjs` (CLI)**

```js
import { bootstrapAdmin } from './bootstrap-admin-core.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.BOOTSTRAP_ADMIN_EMAIL
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
const nome = process.env.BOOTSTRAP_ADMIN_NOME ?? 'Admin'

try {
  if (!email || !password) {
    throw new Error('defina BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD no ambiente')
  }
  const { status, userId } = await bootstrapAdmin({ url, serviceKey, email, password, nome })
  console.log(`✓ admin ${email} — ${status} (id=${userId})`)
  process.exit(0)
} catch (e) {
  console.error(`✗ bootstrap falhou: ${e.message}`)
  process.exit(1)
}
```

- [ ] **Step 5: Adicionar o script ao `package.json`**

No bloco `"scripts"`, adicionar após a linha `"test:e2e": "playwright test"` (lembre da vírgula na linha anterior):
```json
    "test:e2e": "playwright test",
    "bootstrap:admin": "node scripts/bootstrap-admin.mjs"
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/bootstrap-admin.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/bootstrap-admin-core.mjs scripts/bootstrap-admin.mjs package.json tests/integration/bootstrap-admin.test.ts
git commit -m "feat(auth): script idempotente de bootstrap do primeiro admin"
```

---

## Task 4: Login por senha

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Substituir o conteúdo de `src/app/login/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErrMsg(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) {
      setSubmitting(false)
      setErrMsg('E-mail ou senha inválidos.')
      return
    }
    const next = new URLSearchParams(window.location.search).get('next') || '/'
    router.push(next)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar — IAgentics Finanças</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@iagentics.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Entrando...' : 'Entrar'}
            </Button>
            {errMsg && <p className="text-sm text-destructive">{errMsg}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: build conclui sem erros (sem referências a `signInWithOtp`).

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(auth): login por e-mail + senha (remove magic link)"
```

---

## Task 5: Limpeza do callback + bloqueio de auto-cadastro

**Files:**
- Modify: `src/app/auth/callback/route.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Simplificar `src/app/auth/callback/route.ts` (remover bootstrap de admin)**

Substituir todo o conteúdo por:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Login agora é por senha (sem callback). Mantemos um callback mínimo apenas
// para a troca de code → sessão de eventuais fluxos futuros (ex.: OAuth).
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL('/login?error=exchange_failed', request.url))
  }

  return NextResponse.redirect(new URL(next, request.url))
}
```

- [ ] **Step 2: Desabilitar auto-cadastro em `supabase/config.toml`**

Em `[auth]` (linha ~177), trocar:
```toml
enable_signup = true
```
por:
```toml
enable_signup = false
```

Em `[auth.email]` (linha ~222), trocar:
```toml
enable_signup = true
```
por:
```toml
enable_signup = false
```

- [ ] **Step 3: Reiniciar o Supabase local e verificar build**

Run: `supabase stop; supabase start`
Run: `npm run build`
Expected: build OK; nenhum import de `createServiceClient` restante em `auth/callback/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/callback/route.ts supabase/config.toml
git commit -m "chore(auth): callback mínimo + desabilita auto-cadastro (enable_signup=false)"
```

> **Passo manual no deploy (não testável localmente):** no Supabase Cloud (projeto `ddadovgiqecmaeewkgmf`), Authentication → Sign In / Providers → desabilitar "Allow new users to sign up". Isso espelha o `enable_signup=false`.

---

## Task 6: Tela admin `/config/usuarios` + server actions + componentes

**Files:**
- Create: `src/components/usuarios/usuario-create-form.tsx`
- Create: `src/components/usuarios/usuarios-table.tsx`
- Create: `src/app/(dashboard)/config/usuarios/page.tsx`

- [ ] **Step 1: Criar `src/components/usuarios/usuario-create-form.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ROLES_ATRIBUIVEIS, type RoleAtribuivel } from '@/modules/usuarios/types'

type Props = {
  onCriar: (input: { email: string; senha: string; nome: string; role: RoleAtribuivel }) => Promise<void>
}

export function UsuarioCreateForm({ onCriar }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [role, setRole] = useState<RoleAtribuivel>('leitura')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    setOk(null)
    try {
      await onCriar({ email, senha, nome, role })
      setOk(`Usuário ${email} criado.`)
      setEmail(''); setNome(''); setSenha(''); setRole('leitura')
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Novo usuário</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="senha">Senha * (mín. 8)</Label>
              <Input id="senha" type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Papel *</Label>
              <select
                id="role"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background border-border"
                value={role}
                onChange={(e) => setRole(e.target.value as RoleAtribuivel)}
              >
                {ROLES_ATRIBUIVEIS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          {ok && <p className="text-sm text-emerald-400">{ok}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Criando...' : 'Criar usuário'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Criar `src/components/usuarios/usuarios-table.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ROLES_ATRIBUIVEIS, type RoleAtribuivel, type UsuarioListItem } from '@/modules/usuarios/types'

type Props = {
  usuarios: UsuarioListItem[]
  meId: string
  onRedefinirSenha: (userId: string, novaSenha: string) => Promise<void>
  onTrocarRole: (userId: string, role: RoleAtribuivel) => Promise<void>
  onRemover: (userId: string) => Promise<void>
}

export function UsuariosTable({ usuarios, meId, onRedefinirSenha, onTrocarRole, onRemover }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function run(fn: () => Promise<void>) {
    setErr(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erro desconhecido')
      }
    })
  }

  return (
    <div className="space-y-2">
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((u) => {
            const isAdmin = u.role === 'admin'
            const isMe = u.id === meId
            return (
              <TableRow key={u.id}>
                <TableCell>{u.nome}</TableCell>
                <TableCell className="text-muted-foreground">{u.email ?? '—'}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <span className="text-primary font-medium">admin</span>
                  ) : (
                    <select
                      className="border rounded-md px-2 py-1 text-sm bg-background border-border"
                      value={u.role}
                      disabled={pending}
                      onChange={(e) => run(() => onTrocarRole(u.id, e.target.value as RoleAtribuivel))}
                    >
                      {ROLES_ATRIBUIVEIS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      const nova = window.prompt(`Nova senha para ${u.email ?? u.nome} (mín. 8 caracteres):`)
                      if (nova && nova.length >= 8) run(() => onRedefinirSenha(u.id, nova))
                      else if (nova) setErr('Senha deve ter ao menos 8 caracteres.')
                    }}
                  >
                    Redefinir senha
                  </Button>
                  {!isAdmin && !isMe && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Remover ${u.email ?? u.nome}? Esta ação é permanente.`)) run(() => onRemover(u.id))
                      }}
                    >
                      Remover
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 3: Criar `src/app/(dashboard)/config/usuarios/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  listarUsuarios, criarUsuario, redefinirSenha, trocarRole, removerUsuario,
} from '@/modules/usuarios/usuarios'
import type { Actor, RoleAtribuivel } from '@/modules/usuarios/types'
import { UsuarioCreateForm } from '@/components/usuarios/usuario-create-form'
import { UsuariosTable } from '@/components/usuarios/usuarios-table'

async function getAdminActor(): Promise<Actor> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: row } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (row?.role !== 'admin') redirect('/')
  return { id: user.id, role: row.role }
}

export default async function UsuariosPage() {
  const actor = await getAdminActor()
  const usuarios = await listarUsuarios(actor)

  async function criarAction(input: { email: string; senha: string; nome: string; role: RoleAtribuivel }) {
    'use server'
    const a = await getAdminActor()
    await criarUsuario(input, a)
    revalidatePath('/config/usuarios')
  }
  async function redefinirSenhaAction(userId: string, novaSenha: string) {
    'use server'
    const a = await getAdminActor()
    await redefinirSenha({ userId, novaSenha }, a)
  }
  async function trocarRoleAction(userId: string, role: RoleAtribuivel) {
    'use server'
    const a = await getAdminActor()
    await trocarRole({ userId, role }, a)
    revalidatePath('/config/usuarios')
  }
  async function removerAction(userId: string) {
    'use server'
    const a = await getAdminActor()
    await removerUsuario(userId, a)
    revalidatePath('/config/usuarios')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Usuários</h1>
      <UsuarioCreateForm onCriar={criarAction} />
      <UsuariosTable
        usuarios={usuarios}
        meId={actor.id}
        onRedefinirSenha={redefinirSenhaAction}
        onTrocarRole={trocarRoleAction}
        onRemover={removerAction}
      />
    </div>
  )
}
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build OK; rota `/config/usuarios` aparece na listagem.

- [ ] **Step 5: Commit**

```bash
git add src/components/usuarios/usuario-create-form.tsx src/components/usuarios/usuarios-table.tsx "src/app/(dashboard)/config/usuarios/page.tsx"
git commit -m "feat(usuarios): tela admin /config/usuarios (criar/listar/role/senha/remover)"
```

---

## Task 7: Item de menu admin-only no sidebar

**Files:**
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Atualizar `src/components/sidebar.tsx`**

Trocar a assinatura e o cálculo do nav. Substituir a linha:
```tsx
export function Sidebar({ alertasUnread = 0 }: { alertasUnread?: number }) {
  const pathname = usePathname()
```
por:
```tsx
export function Sidebar({ alertasUnread = 0, isAdmin = false }: { alertasUnread?: number; isAdmin?: boolean }) {
  const pathname = usePathname()
  const nav = isAdmin ? [...NAV, { href: '/config/usuarios', label: 'Usuários' }] : NAV
```
E trocar `{NAV.map((item) => {` por `{nav.map((item) => {`.

- [ ] **Step 2: Atualizar `src/app/(dashboard)/layout.tsx` para passar `isAdmin`**

Substituir o corpo por:
```tsx
import { Sidebar } from '@/components/sidebar'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: roleRow } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  const isAdmin = roleRow?.role === 'admin'

  const { count: alertasUnread } = await supabase
    .from('alertas').select('id', { count: 'exact', head: true }).eq('lido', false)

  return (
    <div className="flex min-h-screen">
      <Sidebar alertasUnread={alertasUnread ?? 0} isAdmin={isAdmin} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx "src/app/(dashboard)/layout.tsx"
git commit -m "feat(usuarios): link 'Usuários' no sidebar visível só para admin"
```

---

## Task 8: Limpeza final — substituir first-login.test, README, suíte + build verdes

**Files:**
- Delete: `tests/integration/first-login.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Remover o teste obsoleto do bootstrap via callback**

```bash
git rm tests/integration/first-login.test.ts
```
(A invariante "primeiro/único admin" agora é coberta por `tests/integration/bootstrap-admin.test.ts`.)

- [ ] **Step 2: Atualizar o README**

Em `README.md`, localizar a seção de autenticação/login (procure por "magic link" ou "login"). Substituir a descrição por:

```markdown
## Autenticação

Login por **e-mail + senha** (`signInWithPassword`). Não há auto-cadastro:
contas são criadas por um admin em **/config/usuarios**.

### Primeiro admin (bootstrap)

Com o Supabase configurado, defina no ambiente e rode uma vez:

```bash
export NEXT_PUBLIC_SUPABASE_URL=...        # ou http://127.0.0.1:54321 local
export SUPABASE_SERVICE_ROLE_KEY=...
export BOOTSTRAP_ADMIN_EMAIL=voce@iagentics.com
export BOOTSTRAP_ADMIN_PASSWORD='uma-senha-forte'
export BOOTSTRAP_ADMIN_NOME='Seu Nome'
npm run bootstrap:admin
```

O script é idempotente: re-rodar atualiza a senha do admin e mantém um único admin.
No Supabase Cloud, desabilite "Allow new users to sign up" em Authentication → Sign In / Providers.
```

(Se não houver seção de autenticação, adicione este bloco logo após a seção de setup/instalação.)

- [ ] **Step 3: Rodar a suíte de integração completa**

Run: `npm run test:int`
Expected: PASS — incluindo `usuarios.test.ts` e `bootstrap-admin.test.ts`, sem `first-login.test.ts`.

- [ ] **Step 4: Rodar a suíte unitária + build**

Run: `npm run test:unit`
Expected: PASS.
Run: `npm run build`
Expected: build conclui sem erros.

- [ ] **Step 5: Commit**

```bash
git add README.md tests/integration/first-login.test.ts
git commit -m "chore(auth): remove teste de bootstrap por callback + doc de login por senha"
```

---

## Notas de verificação manual (após implementação)

Rodar o app e exercitar o fluxo como usuário (skill `run`):
1. `npm run bootstrap:admin` (com envs locais) → cria o admin.
2. `npm run dev` → abrir `/login`, entrar com e-mail + senha do admin → cai no dashboard.
3. Sidebar mostra "Usuários" (admin) → abrir `/config/usuarios`, criar um usuário `financeiro`.
4. Logout/entrar com o novo usuário → login funciona; "Usuários" NÃO aparece no sidebar.
5. Como admin: redefinir senha do usuário, trocar role, remover.
