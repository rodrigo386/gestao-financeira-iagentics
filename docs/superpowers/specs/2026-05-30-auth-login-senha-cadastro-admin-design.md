# Login por senha + cadastro gerido pelo admin — Design

**Data:** 2026-05-30
**Status:** aprovado (aguardando review do spec)

## Objetivo

Eliminar o login por magic link — que depende de SMTP (ausente no deploy Railway/Supabase Cloud) — e substituí-lo por **login com e-mail + senha**. Contas são criadas **exclusivamente por um admin** através de uma tela interna; **não há auto-cadastro público**, pois o sistema expõe dados financeiros reais numa URL pública.

## Contexto atual (o que muda)

- **Login** ([src/app/login/page.tsx](../../../src/app/login/page.tsx)): hoje usa `supabase.auth.signInWithOtp({ email, emailRedirectTo: /auth/callback })` (magic link).
- **Callback** ([src/app/auth/callback/route.ts](../../../src/app/auth/callback/route.ts)): troca o code por sessão e **faz bootstrap** da linha `usuarios` — primeiro usuário vira `admin` (via índice parcial `usuarios_admin_singleton`), demais viram `leitura`.
- **Middleware** ([src/middleware.ts](../../../src/middleware.ts)): protege tudo exceto `/login`, `/auth/callback`, `/api/cron`. Redireciona não-autenticado → `/login` (com `?next=`); autenticado em `/login` → `/`.
- **Tabela `usuarios`** ([supabase/migrations/0001_init.sql](../../../supabase/migrations/0001_init.sql)): `id` (= `auth.users.id`), `nome`, `role user_role` com enum `('admin','financeiro','leitura')`, default `leitura`. Helpers: `current_role()`, `is_admin()`, `can_write()` (= admin ou financeiro). RLS: insert/update/delete em `usuarios` exigem `is_admin()` (update também permite o próprio usuário).
- **Clients**: `browser.ts` usa `createBrowserClient` (cookie-based → `signInWithPassword` grava cookies que o middleware lê); `service.ts` usa service role (`auth.admin.*` disponível).
- **config.toml**: `enable_signup = true` em `[auth]` e `[auth.email]`; `enable_confirmations = false`.

## Arquitetura

Fluxo novo, sem dependência de e-mail/SMTP:

1. **Admin cria usuário** na tela `/config/usuarios` → Server Action (service role) chama `auth.admin.createUser({ email, password, email_confirm: true })` e insere a linha em `usuarios` com a role escolhida.
2. **Usuário faz login** em `/login` com e-mail + senha → `signInWithPassword` (browser client) grava cookies de sessão → middleware enxerga o usuário → acesso liberado. **Sem `/auth/callback` no caminho de login.**
3. **Primeiro admin** é criado uma vez por um script de bootstrap idempotente (service role).

Auto-cadastro fica **bloqueado em duas camadas**: (a) sem página pública de signup; (b) `enable_signup = false` no Supabase impede `signUp` via anon key. Criação só via service role, que ignora o flag.

## Componentes

### C1. Login com senha
`src/app/login/page.tsx` — campos **e-mail + senha**; submit chama `signInWithPassword`. Em sucesso: `router.push(next ?? '/')` e `router.refresh()`. Em erro (`Invalid login credentials` etc.): mensagem PT-BR genérica ("E-mail ou senha inválidos") em `text-destructive`. Remove o estado `'sent'`/"link enviado" e qualquer referência a `signInWithOtp`. Mantém o visual dark/terminal e tokens de marca já existentes.

### C2. Bloqueio de auto-cadastro
`supabase/config.toml`: `enable_signup = false` em `[auth]` e em `[auth.email]` (mantém `enable_confirmations = false`). **Aplicar também no projeto cloud** (Dashboard → Authentication → Sign In/Providers, ou via management API/MCP).

### C3. Tela admin de usuários — `/config/usuarios`
Página em `src/app/(dashboard)/config/usuarios/page.tsx`, **admin-only**: no server, busca `is_admin()`/role do usuário atual; se não for admin, `redirect('/')` (ou 404). Renderiza:
- **Lista** de usuários: nome, e-mail, role. (E-mail vem de `auth.admin.listUsers()` casado por `id` com as linhas de `usuarios`; ou de uma view. Decisão: casar via service role no server, sem expor service role ao client.)
- **Form de criação**: e-mail, senha (min 8), nome, role (`financeiro` | `leitura`).
- Ações por usuário: **redefinir senha**, **trocar role** (`financeiro`/`leitura`), **remover**.

Server Actions em `src/app/(dashboard)/config/usuarios/actions.ts` (ou módulo `src/modules/usuarios/`), todas marcadas server-side, usando `createServiceClient`. **Cada ação re-checa `is_admin()` do chamador** (lendo a sessão via server client antes de usar o service role) e grava em `audit_log` (padrão do projeto). Ações:
- `criarUsuario({ email, senha, nome, role })`: `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome } })` → insert em `usuarios` (`id`, `nome`, `role`). Rejeita `role='admin'`.
- `redefinirSenha({ userId, novaSenha })`: `auth.admin.updateUserById(userId, { password })`.
- `trocarRole({ userId, role })`: update em `usuarios`; rejeita `admin` e impede alterar o próprio admin.
- `removerUsuario({ userId })`: deleta explicitamente a linha `usuarios` (service role) e depois `auth.admin.deleteUser(userId)` — ordem determinística, sem depender de `ON DELETE CASCADE`. Impede remover a si mesmo / o admin.

Validação de input com `zod` (padrão do projeto). Link para a tela no sidebar/área de config, visível apenas para admin.

### C4. Bootstrap do primeiro admin
`scripts/bootstrap-admin.mjs` — script Node idempotente, rodado uma vez com `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` + `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` + `BOOTSTRAP_ADMIN_NOME` no ambiente. Lógica:
1. Procura auth user pelo e-mail (`auth.admin.listUsers` paginado, ou `getUserById` se conhecido).
2. Se **não existe** → `auth.admin.createUser({ email, password, email_confirm: true })`.
3. Se **já existe** (ex.: criado no magic link durante screenshots) → `auth.admin.updateUserById(id, { password })` para definir a senha.
4. **Upsert** da linha `usuarios`: `{ id, nome, role: 'admin' }`. O índice singleton garante um único admin; re-rodar é seguro.

Adicionar script ao `package.json`: `"bootstrap:admin": "node scripts/bootstrap-admin.mjs"`. Documentar no README a sequência: setar envs → `npm run bootstrap:admin`.

### C5. Limpeza do magic link
- Remover `signInWithOtp` de `login/page.tsx` (feito em C1).
- Em `src/app/auth/callback/route.ts`: **remover a lógica de bootstrap de admin** (agora é do script + tela). Manter um callback mínimo que apenas troca code por sessão e redireciona para `next` — útil para fluxos futuros (OAuth/reset). `/auth/callback` continua público no middleware.

## Fluxo de dados

```
[Admin] /config/usuarios --(Server Action, re-check is_admin)--> service role
   -> auth.admin.createUser(email,password,email_confirm:true)
   -> insert usuarios(id,nome,role) + audit_log
[Usuário] /login --(signInWithPassword, browser/cookie client)--> cookies de sessão
   -> middleware getUser() OK -> acesso
[Bootstrap] scripts/bootstrap-admin.mjs --(service role)--> cria/atualiza admin + upsert usuarios
```

## Tratamento de erros

- **Login**: credencial inválida → mensagem PT-BR genérica, sem vazar se o e-mail existe. Campos obrigatórios via HTML5 + checagem.
- **Criar usuário**: e-mail duplicado (`auth.admin.createUser` falha) → mensagem clara; senha < 8 → erro de validação `zod`; tentativa de `role='admin'` → rejeitada.
- **Autorização**: qualquer Server Action chamada por não-admin → erro/`redirect`; a página em si redireciona não-admin.
- **Bootstrap**: idempotente; loga claramente "criado" vs "senha atualizada" vs "já era admin".

## Testes

- **Integração** (`tests/integration/`):
  - `criarUsuario` exige admin: chamada como `leitura`/`financeiro` é rejeitada.
  - `criarUsuario` cria auth user + linha `usuarios` com a role pedida e rejeita `admin`.
  - `signInWithPassword` autentica um usuário recém-criado.
  - `redefinirSenha`/`trocarRole`/`removerUsuario`: caminho admin OK, não-admin bloqueado; não permite mexer no próprio admin.
- **Bootstrap**: rodar duas vezes mantém exatamente um admin (idempotência) e atualiza senha em re-run.
- **e2e** (`tests/e2e/helpers/auth.ts`): trocar geração de magic link por `auth.admin.createUser` + `signInWithPassword`.
- Suíte existente (~203 tests) deve continuar verde.

## Restrições e decisões

- **Um admin só**: índice `usuarios_admin_singleton` mantido. Novos usuários são `financeiro`/`leitura`; criar 2º admin falha de propósito. Multi-admin no futuro = derrubar o índice (fora de escopo).
- **Senha mínima 8 caracteres.**
- **Sem "esqueci a senha" por e-mail** (sem SMTP) — admin redefine pela tela.
- **Email confirm**: `email_confirm: true` na criação → login imediato, sem SMTP.

## Fora de escopo

- Recuperação de senha self-service por e-mail (depende de SMTP).
- OAuth / provedores externos.
- MFA.
- Múltiplos admins / RBAC mais granular.
