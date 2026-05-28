create type ar_origem as enum ('contrato', 'milestone', 'avulso');
create type ar_status as enum ('previsto', 'emitido', 'recebido', 'atrasado', 'cancelado');

create table public.contas_a_receber (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id) on delete restrict,
  origem          ar_origem not null,
  origem_id       uuid,
  valor           numeric(14,2) not null check (valor > 0),
  moeda           text not null default 'BRL',
  data_emissao    date not null,
  data_vencimento date not null,
  status          ar_status not null default 'previsto',
  data_recebimento date,
  lancamento_id   uuid,
  nf_externa_id   text,
  nf_url          text,
  observacoes     text,
  anexo_path      text,
  data_emissao_mes date generated always as (data_emissao - (extract(day from data_emissao)::int - 1)) stored,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint ar_vencimento_apos_emissao check (data_vencimento >= data_emissao),
  constraint ar_recebido_requer_data check (
    (status <> 'recebido') or (data_recebimento is not null)
  ),
  constraint ar_origem_id_when_not_avulso check (
    (origem = 'avulso') or (origem_id is not null)
  )
);

create index ar_cliente on public.contas_a_receber (cliente_id);
create index ar_status_aberto on public.contas_a_receber (status, data_vencimento)
  where status in ('previsto', 'emitido', 'atrasado');
create index ar_origem_lookup on public.contas_a_receber (origem, origem_id);

create unique index ar_contrato_mes_unique
  on public.contas_a_receber (origem_id, data_emissao_mes)
  where origem = 'contrato';

create unique index ar_milestone_unique
  on public.contas_a_receber (origem_id)
  where origem = 'milestone';

create trigger contas_a_receber_atualizado_em
  before update on public.contas_a_receber
  for each row execute function public.tg_set_atualizado_em();

alter table public.contas_a_receber enable row level security;

create policy "ar_select_authenticated"
  on public.contas_a_receber for select to authenticated using (true);

create policy "ar_modify_can_write"
  on public.contas_a_receber for all to authenticated
  using (public.can_write()) with check (public.can_write());
