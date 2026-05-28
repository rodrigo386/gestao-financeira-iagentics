-- organizacao: single-row config for IAgentics
create table public.organizacao (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  cnpj         text,
  regime_tributario text not null check (regime_tributario in ('simples', 'lucro_presumido', 'lucro_real')),
  moeda_padrao text not null default 'BRL',
  mes_fiscal_inicio int not null default 1 check (mes_fiscal_inicio between 1 and 12),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- enforce single row
create unique index organizacao_singleton on public.organizacao ((1));

-- usuarios: app-level user data linked to auth.users
create type user_role as enum ('admin', 'financeiro', 'leitura');

create table public.usuarios (
  id    uuid primary key references auth.users(id) on delete cascade,
  nome  text not null,
  role  user_role not null default 'leitura',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- helper: current user's role (used by RLS policies)
create or replace function public.current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.usuarios where id = auth.uid()
$$;

-- helper: is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.usuarios where id = auth.uid()), false)
$$;

-- helper: can write (admin or financeiro)
create or replace function public.can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('admin', 'financeiro') from public.usuarios where id = auth.uid()), false)
$$;

-- RLS: usuarios
alter table public.usuarios enable row level security;

create policy "usuarios_select_authenticated"
  on public.usuarios for select
  to authenticated
  using (true);

create policy "usuarios_insert_admin"
  on public.usuarios for insert
  to authenticated
  with check (public.is_admin());

create policy "usuarios_update_admin_or_self"
  on public.usuarios for update
  to authenticated
  using (public.is_admin() or id = auth.uid())
  with check (public.is_admin() or id = auth.uid());

create policy "usuarios_delete_admin"
  on public.usuarios for delete
  to authenticated
  using (public.is_admin());

-- RLS: organizacao
alter table public.organizacao enable row level security;

create policy "organizacao_select_authenticated"
  on public.organizacao for select
  to authenticated
  using (true);

create policy "organizacao_modify_admin"
  on public.organizacao for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- atualizado_em trigger
create or replace function public.tg_set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

create trigger organizacao_atualizado_em
  before update on public.organizacao
  for each row execute function public.tg_set_atualizado_em();
