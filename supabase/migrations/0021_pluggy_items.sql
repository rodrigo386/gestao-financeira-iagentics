create type pluggy_item_status as enum ('updating', 'updated', 'login_error', 'waiting_user_input', 'outdated', 'error');

create table public.pluggy_items (
  id                  uuid primary key default gen_random_uuid(),
  pluggy_item_id      text not null unique,           -- Pluggy's item UUID
  conta_bancaria_id   uuid references public.contas_bancarias(id) on delete set null,
  banco_nome          text not null,
  status              pluggy_item_status not null default 'updating',
  last_synced_at      timestamptz,
  last_error          text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create index pluggy_items_conta on public.pluggy_items (conta_bancaria_id);
create index pluggy_items_status on public.pluggy_items (status);

create trigger pluggy_items_atualizado_em
  before update on public.pluggy_items
  for each row execute function public.tg_set_atualizado_em();

alter table public.pluggy_items enable row level security;

create policy "pluggy_items_select_authenticated"
  on public.pluggy_items for select to authenticated using (true);

create policy "pluggy_items_modify_admin"
  on public.pluggy_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
