create type funcionario_tipo as enum ('clt', 'pj_recorrente');

create table public.funcionarios (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  cpf                text,
  cargo              text not null,
  tipo               funcionario_tipo not null default 'clt',
  salario_base       numeric(14,2) not null check (salario_base >= 0),
  beneficios_json    jsonb not null default '{}'::jsonb,
  -- { "vr": 30, "vr_dias": 22, "va": 800, "plano_saude": 600, "plano_dental": 50 }
  encargos_pct_json  jsonb not null default '{"fgts": 8, "inss_patronal": 20, "provisao_13": 8.33, "provisao_ferias": 11.11}'::jsonb,
  centro_custo       text,
  data_admissao      date not null,
  data_desligamento  date,
  ativo              boolean not null default true,
  chave_pix          text,
  banco_conta_json   jsonb,
  usuario_id         uuid references public.usuarios(id) on delete set null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint funcionario_desligamento_apos_admissao check (
    data_desligamento is null or data_desligamento >= data_admissao
  )
);

create index funcionarios_ativo on public.funcionarios (id) where ativo;
create index funcionarios_tipo on public.funcionarios (tipo);

create trigger funcionarios_atualizado_em
  before update on public.funcionarios
  for each row execute function public.tg_set_atualizado_em();

alter table public.funcionarios enable row level security;

-- admin sees all; funcionario sees own row only
create policy "funcionarios_select_admin_or_self"
  on public.funcionarios for select to authenticated
  using (public.is_admin() or (usuario_id is not null and usuario_id = auth.uid()));

create policy "funcionarios_modify_admin"
  on public.funcionarios for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
