create type folha_status as enum ('aberta', 'fechada');

create table public.folha (
  id           uuid primary key default gen_random_uuid(),
  mes_ref      date not null,   -- always day=01
  status       folha_status not null default 'aberta',
  gerada_em    timestamptz not null default now(),
  fechada_em   timestamptz,
  fechada_por  uuid references public.usuarios(id) on delete set null,
  observacoes  text,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (mes_ref),
  constraint folha_mes_ref_dia_um check (extract(day from mes_ref) = 1),
  constraint folha_fechada_requer_data check (
    (status <> 'fechada') or (fechada_em is not null and fechada_por is not null)
  )
);

create index folha_mes_ref on public.folha (mes_ref desc);

create trigger folha_atualizado_em
  before update on public.folha
  for each row execute function public.tg_set_atualizado_em();

create table public.itens_folha (
  id                uuid primary key default gen_random_uuid(),
  folha_id          uuid not null references public.folha(id) on delete cascade,
  funcionario_id    uuid not null references public.funcionarios(id) on delete restrict,
  salario_bruto     numeric(14,2) not null,
  beneficios_valor  numeric(14,2) not null default 0,
  inss_funcionario  numeric(14,2) not null default 0,
  irrf              numeric(14,2) not null default 0,
  outros_descontos_json jsonb not null default '{}'::jsonb,
  liquido_pagar     numeric(14,2) not null,
  -- encargos do empregador (custo, não desconto do funcionário)
  fgts              numeric(14,2) not null default 0,
  inss_patronal     numeric(14,2) not null default 0,
  provisao_13       numeric(14,2) not null default 0,
  provisao_ferias   numeric(14,2) not null default 0,
  total_encargos    numeric(14,2) not null default 0,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  unique (folha_id, funcionario_id)
);

create index itens_folha_funcionario on public.itens_folha (funcionario_id);

create trigger itens_folha_atualizado_em
  before update on public.itens_folha
  for each row execute function public.tg_set_atualizado_em();

create table public.holerites (
  id            uuid primary key default gen_random_uuid(),
  item_folha_id uuid not null references public.itens_folha(id) on delete cascade,
  storage_path  text not null,
  gerado_em     timestamptz not null default now(),
  unique (item_folha_id)
);

create index holerites_item on public.holerites (item_folha_id);

alter table public.folha enable row level security;
alter table public.itens_folha enable row level security;
alter table public.holerites enable row level security;

-- folha: admin only (sensitive)
create policy "folha_select_admin"
  on public.folha for select to authenticated using (public.is_admin());
create policy "folha_modify_admin"
  on public.folha for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- itens_folha: admin sees all; funcionario sees own only
create policy "itens_folha_select_admin_or_self"
  on public.itens_folha for select to authenticated
  using (
    public.is_admin() or
    funcionario_id in (select id from public.funcionarios where usuario_id = auth.uid())
  );
create policy "itens_folha_modify_admin"
  on public.itens_folha for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- holerites: same as itens_folha
create policy "holerites_select_admin_or_self"
  on public.holerites for select to authenticated
  using (
    public.is_admin() or
    item_folha_id in (
      select i.id from public.itens_folha i
      join public.funcionarios f on f.id = i.funcionario_id
      where f.usuario_id = auth.uid()
    )
  );
create policy "holerites_modify_admin"
  on public.holerites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
