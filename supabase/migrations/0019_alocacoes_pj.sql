create type alocacao_remuneracao as enum ('fixo', 'hora', 'entregavel');
create type alocacao_status as enum ('contratado', 'em_andamento', 'concluido', 'pago');

create table public.alocacoes_pj (
  id                   uuid primary key default gen_random_uuid(),
  pj_id                uuid not null references public.pj_spot(id) on delete restrict,
  projeto_id           uuid references public.projetos(id) on delete set null,
  descricao            text not null,
  escopo               text,
  tipo_remuneracao     alocacao_remuneracao not null default 'fixo',
  valor_total          numeric(14,2) not null check (valor_total >= 0),
  horas_estimadas      numeric(8,2),
  horas_realizadas     numeric(8,2),
  data_inicio          date not null,
  data_prevista_fim    date not null,
  status               alocacao_status not null default 'contratado',
  ap_id                uuid references public.contas_a_pagar(id) on delete set null,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint alocacao_fim_apos_inicio check (data_prevista_fim >= data_inicio)
);

create index alocacoes_pj_id on public.alocacoes_pj (pj_id);
create index alocacoes_projeto on public.alocacoes_pj (projeto_id) where projeto_id is not null;
create index alocacoes_status on public.alocacoes_pj (status);

create trigger alocacoes_pj_atualizado_em
  before update on public.alocacoes_pj
  for each row execute function public.tg_set_atualizado_em();

alter table public.alocacoes_pj enable row level security;

create policy "alocacoes_select_authenticated"
  on public.alocacoes_pj for select to authenticated using (true);

create policy "alocacoes_modify_admin"
  on public.alocacoes_pj for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
