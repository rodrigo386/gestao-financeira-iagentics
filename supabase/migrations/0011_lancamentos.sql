create type lancamento_tipo as enum ('entrada', 'saida', 'transferencia');
create type lancamento_origem as enum ('manual', 'ar', 'ap', 'pluggy', 'estorno');

create table public.lancamentos (
  id                    uuid primary key default gen_random_uuid(),
  data                  date not null,
  valor                 numeric(14,2) not null check (valor > 0),
  conta_id              uuid not null references public.contas_bancarias(id) on delete restrict,
  tipo                  lancamento_tipo not null,
  categoria_id          uuid references public.categorias(id) on delete restrict,
  descricao             text not null,
  origem                lancamento_origem not null default 'manual',
  origem_id             uuid,
  fornecedor_id         uuid,
  cliente_id            uuid references public.clientes(id) on delete restrict,
  projeto_id            uuid references public.projetos(id) on delete restrict,
  conciliado            boolean not null default false,
  pluggy_transaction_id text unique,
  categorizacao_metodo  text check (categorizacao_metodo in ('manual', 'regra', 'historico', 'llm')),
  categorizacao_confianca numeric(3,2) check (categorizacao_confianca between 0 and 1),
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index lancamentos_data on public.lancamentos (data desc);
create index lancamentos_conta_data on public.lancamentos (conta_id, data desc);
create index lancamentos_categoria on public.lancamentos (categoria_id);
create index lancamentos_origem on public.lancamentos (origem, origem_id);
create index lancamentos_nao_conciliado on public.lancamentos (id) where conciliado = false and origem = 'pluggy';

create trigger lancamentos_atualizado_em
  before update on public.lancamentos
  for each row execute function public.tg_set_atualizado_em();

alter table public.lancamentos enable row level security;

create policy "lancamentos_select_authenticated"
  on public.lancamentos for select to authenticated using (true);

create policy "lancamentos_modify_can_write"
  on public.lancamentos for all to authenticated
  using (public.can_write()) with check (public.can_write());
