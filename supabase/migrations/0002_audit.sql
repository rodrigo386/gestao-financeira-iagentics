create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid references public.usuarios(id) on delete set null,
  acao        text not null check (acao in ('insert', 'update', 'delete', 'custom')),
  tabela      text not null,
  registro_id uuid,
  before_json jsonb,
  after_json  jsonb,
  motivo      text,
  contexto_json jsonb,
  criado_em   timestamptz not null default now()
);

create index audit_log_tabela_registro on public.audit_log (tabela, registro_id, criado_em desc);
create index audit_log_usuario on public.audit_log (usuario_id, criado_em desc);

alter table public.audit_log enable row level security;

-- only admin can read
create policy "audit_log_select_admin"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());

-- inserts come from service_role (server-side audit wrapper); no client-side insert policy
-- updates and deletes are not allowed (append-only)
