create table public.forecast_cenarios (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  drivers_json  jsonb not null,
  -- {
  --   "novos_clientes_mes": 1,
  --   "churn_pct": 2,           // % por mês
  --   "ticket_medio_novo": 1500,
  --   "novos_projetos_mes": 0.5,
  --   "valor_medio_projeto": 30000,
  --   "duracao_projeto_meses": 3,
  --   "crescimento_despesa_pct": 1   // % por mês
  -- }
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger forecast_cenarios_atualizado_em
  before update on public.forecast_cenarios
  for each row execute function public.tg_set_atualizado_em();

alter table public.forecast_cenarios enable row level security;

create policy "cenarios_select_authenticated"
  on public.forecast_cenarios for select to authenticated using (true);

create policy "cenarios_modify_can_write"
  on public.forecast_cenarios for all to authenticated
  using (public.can_write()) with check (public.can_write());

-- Seed: Best / Base / Worst
insert into public.forecast_cenarios (nome, drivers_json) values
('Base', '{
  "novos_clientes_mes": 1,
  "churn_pct": 2,
  "ticket_medio_novo": 1500,
  "novos_projetos_mes": 0.5,
  "valor_medio_projeto": 30000,
  "duracao_projeto_meses": 3,
  "crescimento_despesa_pct": 1
}'::jsonb),
('Best', '{
  "novos_clientes_mes": 2,
  "churn_pct": 1,
  "ticket_medio_novo": 2000,
  "novos_projetos_mes": 1,
  "valor_medio_projeto": 40000,
  "duracao_projeto_meses": 3,
  "crescimento_despesa_pct": 0.5
}'::jsonb),
('Worst', '{
  "novos_clientes_mes": 0.5,
  "churn_pct": 5,
  "ticket_medio_novo": 1000,
  "novos_projetos_mes": 0.2,
  "valor_medio_projeto": 20000,
  "duracao_projeto_meses": 3,
  "crescimento_despesa_pct": 2
}'::jsonb);
