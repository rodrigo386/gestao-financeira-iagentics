create table public.pj_spot (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  cpf_cnpj           text,
  especialidade      text,
  contato_email      text,
  contato_telefone   text,
  valor_hora_padrao  numeric(12,2),
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create index pj_spot_ativo on public.pj_spot (id) where ativo;
create index pj_spot_especialidade on public.pj_spot (especialidade) where ativo;

create trigger pj_spot_atualizado_em
  before update on public.pj_spot
  for each row execute function public.tg_set_atualizado_em();

alter table public.pj_spot enable row level security;

create policy "pj_spot_select_authenticated"
  on public.pj_spot for select to authenticated using (true);

create policy "pj_spot_modify_admin"
  on public.pj_spot for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
