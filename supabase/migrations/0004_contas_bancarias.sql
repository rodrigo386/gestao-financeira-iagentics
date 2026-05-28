create type conta_tipo as enum ('cc', 'poupanca', 'investimento');

create table public.contas_bancarias (
  id           uuid primary key default gen_random_uuid(),
  banco        text not null,
  agencia      text,
  conta        text,
  tipo         conta_tipo not null default 'cc',
  moeda        text not null default 'BRL',
  saldo_atual  numeric(14,2) not null default 0,
  pluggy_account_id text unique,
  ativa        boolean not null default true,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger contas_bancarias_atualizado_em
  before update on public.contas_bancarias
  for each row execute function public.tg_set_atualizado_em();

alter table public.contas_bancarias enable row level security;

create policy "contas_select_authenticated"
  on public.contas_bancarias for select
  to authenticated using (true);

create policy "contas_modify_admin"
  on public.contas_bancarias for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
