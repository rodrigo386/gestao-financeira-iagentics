create type contrato_tipo as enum ('mensal', 'anual');
create type contrato_status as enum ('ativo', 'pausado', 'churned');

create table public.contratos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id) on delete restrict,
  nome            text not null,
  tipo            contrato_tipo not null default 'mensal',
  ticket          numeric(14,2) not null check (ticket >= 0),
  moeda           text not null default 'BRL',
  dia_cobranca    int not null default 1 check (dia_cobranca between 1 and 28),
  data_inicio     date not null,
  data_fim        date,
  status          contrato_status not null default 'ativo',
  motivo_churn    text,
  data_churn      date,
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint contrato_fim_apos_inicio check (data_fim is null or data_fim >= data_inicio),
  constraint churn_tem_data check (
    (status <> 'churned') or (data_churn is not null)
  )
);

create index contratos_cliente on public.contratos (cliente_id);
create index contratos_status_ativo on public.contratos (status) where status = 'ativo';
create index contratos_dia_cobranca on public.contratos (dia_cobranca) where status = 'ativo';

create trigger contratos_atualizado_em
  before update on public.contratos
  for each row execute function public.tg_set_atualizado_em();

alter table public.contratos enable row level security;

create policy "contratos_select_authenticated"
  on public.contratos for select to authenticated using (true);

create policy "contratos_modify_can_write"
  on public.contratos for all to authenticated
  using (public.can_write()) with check (public.can_write());
