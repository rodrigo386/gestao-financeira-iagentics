create table public.despesas_recorrentes (
  id            uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete restrict,
  descricao     text not null,
  valor         numeric(14,2) not null check (valor > 0),
  moeda         text not null default 'BRL',
  dia_mes       int not null check (dia_mes between 1 and 28),
  categoria_id  uuid references public.categorias(id) on delete restrict,
  data_inicio   date not null,
  data_fim      date,
  ativa         boolean not null default true,
  proxima_geracao date not null,
  observacoes   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint despesa_fim_apos_inicio check (data_fim is null or data_fim >= data_inicio)
);

create index recorrentes_fornecedor on public.despesas_recorrentes (fornecedor_id);
create index recorrentes_proxima on public.despesas_recorrentes (proxima_geracao) where ativa;
create index recorrentes_ativa on public.despesas_recorrentes (id) where ativa;

create trigger recorrentes_atualizado_em
  before update on public.despesas_recorrentes
  for each row execute function public.tg_set_atualizado_em();

alter table public.despesas_recorrentes enable row level security;

create policy "recorrentes_select_authenticated"
  on public.despesas_recorrentes for select to authenticated using (true);

create policy "recorrentes_modify_can_write"
  on public.despesas_recorrentes for all to authenticated
  using (public.can_write()) with check (public.can_write());
