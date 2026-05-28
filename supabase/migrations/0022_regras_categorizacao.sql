create type regra_pattern_tipo as enum ('contains', 'regex', 'starts_with', 'exact');
create type regra_campo as enum ('descricao', 'fornecedor_nome');
create type regra_origem as enum ('manual', 'auto_aprendida');

create table public.regras_categorizacao (
  id            uuid primary key default gen_random_uuid(),
  prioridade    int not null default 100,
  pattern       text not null,
  pattern_tipo  regra_pattern_tipo not null default 'contains',
  campo         regra_campo not null default 'descricao',
  categoria_id  uuid not null references public.categorias(id) on delete restrict,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  origem        regra_origem not null default 'manual',
  ativa         boolean not null default true,
  total_aplicacoes int not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index regras_ativa_prioridade on public.regras_categorizacao (prioridade desc) where ativa;
create index regras_categoria on public.regras_categorizacao (categoria_id);

create trigger regras_categorizacao_atualizado_em
  before update on public.regras_categorizacao
  for each row execute function public.tg_set_atualizado_em();

alter table public.regras_categorizacao enable row level security;

create policy "regras_select_authenticated"
  on public.regras_categorizacao for select to authenticated using (true);

create policy "regras_modify_can_write"
  on public.regras_categorizacao for all to authenticated
  using (public.can_write()) with check (public.can_write());
