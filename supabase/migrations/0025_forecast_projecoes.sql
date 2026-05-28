create table public.forecast_projecoes (
  cenario_id    uuid not null references public.forecast_cenarios(id) on delete cascade,
  mes_ref       date not null,
  mrr           numeric(14,2) not null,
  receita_total numeric(14,2) not null,
  despesa_total numeric(14,2) not null,
  caixa         numeric(14,2) not null,
  runway_meses  numeric(6,1),   -- null when > 36 months
  gerado_em     timestamptz not null default now(),
  primary key (cenario_id, mes_ref),
  constraint projecao_mes_dia_um check (extract(day from mes_ref) = 1)
);

create index forecast_projecoes_cenario on public.forecast_projecoes (cenario_id, mes_ref);

alter table public.forecast_projecoes enable row level security;

create policy "projecoes_select_authenticated"
  on public.forecast_projecoes for select to authenticated using (true);

create policy "projecoes_modify_can_write"
  on public.forecast_projecoes for all to authenticated
  using (public.can_write()) with check (public.can_write());
