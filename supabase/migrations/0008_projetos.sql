create type projeto_status as enum ('proposta', 'ativo', 'pausado', 'concluido', 'cancelado');

create table public.projetos (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references public.clientes(id) on delete restrict,
  nome                 text not null,
  descricao            text,
  valor_total          numeric(14,2) not null check (valor_total >= 0),
  moeda                text not null default 'BRL',
  data_inicio          date not null,
  data_prevista_fim    date not null,
  data_real_fim        date,
  status               projeto_status not null default 'proposta',
  observacoes          text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint projeto_fim_apos_inicio check (data_prevista_fim >= data_inicio)
);

create index projetos_cliente on public.projetos (cliente_id);
create index projetos_status on public.projetos (status);

create trigger projetos_atualizado_em
  before update on public.projetos
  for each row execute function public.tg_set_atualizado_em();

alter table public.projetos enable row level security;

create policy "projetos_select_authenticated"
  on public.projetos for select to authenticated using (true);

create policy "projetos_modify_can_write"
  on public.projetos for all to authenticated
  using (public.can_write()) with check (public.can_write());
