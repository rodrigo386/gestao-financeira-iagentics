create type cliente_status as enum ('ativo', 'inativo', 'churned');

create table public.clientes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  cnpj          text,
  segmento      text,
  status        cliente_status not null default 'ativo',
  moeda_padrao  text not null default 'BRL',
  contato_email text,
  contato_telefone text,
  observacoes   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index clientes_status on public.clientes (status) where status = 'ativo';
create index clientes_cnpj on public.clientes (cnpj) where cnpj is not null;

create trigger clientes_atualizado_em
  before update on public.clientes
  for each row execute function public.tg_set_atualizado_em();

alter table public.clientes enable row level security;

create policy "clientes_select_authenticated"
  on public.clientes for select to authenticated using (true);

create policy "clientes_modify_can_write"
  on public.clientes for all to authenticated
  using (public.can_write()) with check (public.can_write());
