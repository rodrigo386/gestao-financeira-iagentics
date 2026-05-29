create table public.metricas_mensais (
  id                   uuid primary key default gen_random_uuid(),
  mes_ref              date not null unique,
  mrr                  numeric(14,2) not null,
  arr                  numeric(14,2) not null,
  receita_total        numeric(14,2) not null,
  despesa_total        numeric(14,2) not null,
  resultado            numeric(14,2) not null,
  caixa_fim            numeric(14,2) not null,
  runway_meses         numeric(6,1),               -- null quando despesa=0 ou > 36
  contratos_ativos     integer not null,
  churn_rate           numeric(6,4) not null,
  commentary_resumo    text,
  commentary_destaques jsonb,
  fechado_por          uuid references public.usuarios(id),
  fechado_em           timestamptz not null default now(),
  criado_em            timestamptz not null default now(),
  constraint metricas_mes_dia_um check (extract(day from mes_ref) = 1)
);

alter table public.metricas_mensais enable row level security;

create policy "metricas_select_authenticated"
  on public.metricas_mensais for select to authenticated using (true);

create policy "metricas_modify_can_write"
  on public.metricas_mensais for all to authenticated
  using (public.can_write()) with check (public.can_write());
