create type milestone_status as enum ('pendente', 'em_andamento', 'concluido', 'faturado', 'pago');

create table public.milestones (
  id              uuid primary key default gen_random_uuid(),
  projeto_id      uuid not null references public.projetos(id) on delete cascade,
  ordem           int not null,
  descricao       text not null,
  valor           numeric(14,2) not null check (valor >= 0),
  data_prevista   date not null,
  data_real       date,
  status          milestone_status not null default 'pendente',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (projeto_id, ordem)
);

create index milestones_projeto on public.milestones (projeto_id);
create index milestones_status_pendente on public.milestones (status) where status in ('pendente', 'em_andamento');

create trigger milestones_atualizado_em
  before update on public.milestones
  for each row execute function public.tg_set_atualizado_em();

create or replace function public.check_milestone_total()
returns trigger language plpgsql as $$
declare
  total numeric(14,2);
  projeto_total numeric(14,2);
begin
  select coalesce(sum(valor), 0) into total
  from public.milestones
  where projeto_id = new.projeto_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  total := total + new.valor;

  select valor_total into projeto_total from public.projetos where id = new.projeto_id;

  if total > projeto_total then
    raise exception 'soma de milestones (% ) excede valor do projeto (%)', total, projeto_total;
  end if;

  return new;
end $$;

create trigger milestones_check_total
  before insert or update of valor, projeto_id on public.milestones
  for each row execute function public.check_milestone_total();

alter table public.milestones enable row level security;

create policy "milestones_select_authenticated"
  on public.milestones for select to authenticated using (true);

create policy "milestones_modify_can_write"
  on public.milestones for all to authenticated
  using (public.can_write()) with check (public.can_write());
