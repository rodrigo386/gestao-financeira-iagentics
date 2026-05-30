-- Hardening: impedir que um usuário authenticated não-admin altere a própria
-- coluna `role` via PostgREST direto.
--
-- A policy `usuarios_update_admin_or_self` (0001_init.sql) permite self-update da
-- linha (id = auth.uid()) sem restrição de coluna — então um 'leitura' poderia se
-- auto-promover a 'financeiro' (que tem can_write) chamando a API autenticada
-- diretamente, sem passar pela camada de domínio admin-gated (requireAdmin).
--
-- O guard roda como trigger BEFORE UPDATE. Triggers NÃO são ignorados pelo service
-- role, então:
--   - service_role (caminho admin do app: trocarRole/bootstrap/seed)  -> permitido
--   - admin autenticado (is_admin())                                  -> permitido
--   - qualquer outro authenticated mudando a própria role             -> bloqueado
--   - self-update de colunas não sensíveis (ex.: nome)                -> permitido
--
-- IMPORTANTE: a função é SECURITY INVOKER (padrão) de propósito — `current_user`
-- precisa refletir o papel real do chamador (authenticated/service_role), o que
-- não aconteceria sob SECURITY DEFINER.
create or replace function public.guard_usuarios_role_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.role is distinct from old.role
     and current_user = 'authenticated'
     and not public.is_admin()
  then
    raise exception 'apenas admin pode alterar a role de um usuário'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger trg_usuarios_role_guard
  before update on public.usuarios
  for each row
  execute function public.guard_usuarios_role_change();
