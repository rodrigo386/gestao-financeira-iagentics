create table public.fornecedores (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null,
  cnpj                   text,
  categoria_default_id   uuid references public.categorias(id) on delete set null,
  contato_email          text,
  contato_telefone       text,
  observacoes            text,
  ativo                  boolean not null default true,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);

create index fornecedores_nome on public.fornecedores (nome);
create index fornecedores_cnpj on public.fornecedores (cnpj) where cnpj is not null;
create index fornecedores_ativo on public.fornecedores (id) where ativo;

create trigger fornecedores_atualizado_em
  before update on public.fornecedores
  for each row execute function public.tg_set_atualizado_em();

alter table public.fornecedores enable row level security;

create policy "fornecedores_select_authenticated"
  on public.fornecedores for select to authenticated using (true);

create policy "fornecedores_modify_can_write"
  on public.fornecedores for all to authenticated
  using (public.can_write()) with check (public.can_write());
