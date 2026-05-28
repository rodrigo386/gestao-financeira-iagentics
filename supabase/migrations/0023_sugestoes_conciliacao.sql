create type break_tipo as enum (
  'matched',
  'timing-break',
  'amount-break',
  'mapping-issue',
  'duplicate',
  'bank-only',
  'ledger-only'
);

create type sugestao_status as enum ('pendente', 'aceita', 'rejeitada');

create table public.sugestoes_conciliacao (
  id                uuid primary key default gen_random_uuid(),
  lancamento_id     uuid not null references public.lancamentos(id) on delete cascade,
  candidato_tipo    text check (candidato_tipo in ('ap', 'ar')),
  candidato_id      uuid,                              -- AP or AR id
  break_tipo        break_tipo not null,
  score             numeric(4,3) not null check (score between 0 and 1),
  explicacao        text,
  status            sugestao_status not null default 'pendente',
  resolvida_em      timestamptz,
  resolvida_por     uuid references public.usuarios(id) on delete set null,
  criado_em         timestamptz not null default now()
);

create index sugestoes_lancamento on public.sugestoes_conciliacao (lancamento_id);
create index sugestoes_pendentes on public.sugestoes_conciliacao (criado_em desc) where status = 'pendente';
create index sugestoes_candidato on public.sugestoes_conciliacao (candidato_tipo, candidato_id);

alter table public.sugestoes_conciliacao enable row level security;

create policy "sugestoes_select_authenticated"
  on public.sugestoes_conciliacao for select to authenticated using (true);

create policy "sugestoes_modify_can_write"
  on public.sugestoes_conciliacao for all to authenticated
  using (public.can_write()) with check (public.can_write());
