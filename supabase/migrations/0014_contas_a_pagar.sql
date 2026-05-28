create type ap_tipo_credor as enum ('fornecedor', 'funcionario', 'pj_spot', 'orgao_publico');
create type ap_origem as enum ('recorrente', 'folha', 'alocacao_pj', 'nf', 'avulso');
create type ap_status as enum ('previsto', 'aprovado', 'pago', 'atrasado', 'cancelado');

create table public.contas_a_pagar (
  id              uuid primary key default gen_random_uuid(),
  tipo_credor     ap_tipo_credor not null,
  credor_id       uuid,                                       -- polymorphic; for funcionario/pj_spot set in Phase 3
  origem          ap_origem not null,
  origem_id       uuid,
  descricao       text not null,
  valor           numeric(14,2) not null check (valor > 0),
  moeda           text not null default 'BRL',
  data_vencimento date not null,
  categoria_id    uuid references public.categorias(id) on delete restrict,
  status          ap_status not null default 'previsto',
  data_pagamento  date,
  lancamento_id   uuid references public.lancamentos(id) on delete set null,
  aprovador_id    uuid references public.usuarios(id) on delete set null,
  aprovado_em     timestamptz,
  anexo_path      text,
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  constraint ap_pago_requer_lancamento check (
    (status <> 'pago') or (lancamento_id is not null and data_pagamento is not null)
  ),
  constraint ap_aprovado_requer_aprovador check (
    (status not in ('aprovado', 'pago')) or (aprovador_id is not null and aprovado_em is not null)
  )
);

create index ap_status_aberto on public.contas_a_pagar (status, data_vencimento)
  where status in ('previsto', 'aprovado', 'atrasado');
create index ap_credor on public.contas_a_pagar (tipo_credor, credor_id);
create index ap_origem on public.contas_a_pagar (origem, origem_id);

-- dedup for recurring expenses: one AP per recorrente per month
create unique index ap_recorrente_mes_unique
  on public.contas_a_pagar (origem_id, ((data_vencimento - (extract(day from data_vencimento)::int - 1))))
  where origem = 'recorrente';

create trigger contas_a_pagar_atualizado_em
  before update on public.contas_a_pagar
  for each row execute function public.tg_set_atualizado_em();

alter table public.contas_a_pagar enable row level security;

create policy "ap_select_authenticated"
  on public.contas_a_pagar for select to authenticated using (true);

create policy "ap_modify_can_write"
  on public.contas_a_pagar for all to authenticated
  using (public.can_write()) with check (public.can_write());
