create type alerta_severidade as enum ('info', 'warning', 'critical');
create type alerta_tipo as enum (
  'runway_critico',
  'runway_atencao',
  'ap_atrasada',
  'ar_atrasada',
  'contrato_vencendo',
  'despesa_anomala',
  'caixa_baixo'
);

create table public.alertas (
  id            uuid primary key default gen_random_uuid(),
  tipo          alerta_tipo not null,
  severidade    alerta_severidade not null,
  titulo        text not null,
  mensagem      text not null,
  contexto_json jsonb,            -- { runway_meses, conta_id, ap_id, ar_id, etc }
  lido          boolean not null default false,
  lido_em       timestamptz,
  lido_por      uuid references public.usuarios(id) on delete set null,
  criado_em     timestamptz not null default now()
);

create index alertas_nao_lidos on public.alertas (criado_em desc) where lido = false;
create index alertas_tipo on public.alertas (tipo, criado_em desc);

-- prevent obvious duplicates: same tipo + a hash of contexto_json in last 24h
-- (enforced in code; uniqueness index is too restrictive for JSON contexts)

alter table public.alertas enable row level security;

create policy "alertas_select_authenticated"
  on public.alertas for select to authenticated using (true);

create policy "alertas_modify_can_write"
  on public.alertas for all to authenticated
  using (public.can_write()) with check (public.can_write());
