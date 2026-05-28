create type tabela_fiscal_tipo as enum ('inss', 'irrf');

create table public.tabelas_fiscais (
  id          uuid primary key default gen_random_uuid(),
  ano         int not null,
  tipo        tabela_fiscal_tipo not null,
  faixas_json jsonb not null,  -- [{ate: 1500.00, aliquota: 7.5, deducao: 0}, ...]
  criado_em   timestamptz not null default now(),
  unique (ano, tipo)
);

alter table public.tabelas_fiscais enable row level security;

create policy "tabelas_fiscais_select_authenticated"
  on public.tabelas_fiscais for select to authenticated using (true);

create policy "tabelas_fiscais_modify_admin"
  on public.tabelas_fiscais for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- INSS 2026 (faixas vigentes hipotéticas; ajustar conforme tabela oficial)
insert into public.tabelas_fiscais (ano, tipo, faixas_json) values
(2026, 'inss', '[
  {"ate": 1518.00,  "aliquota": 7.5,  "deducao": 0},
  {"ate": 2793.88,  "aliquota": 9.0,  "deducao": 22.77},
  {"ate": 4190.83,  "aliquota": 12.0, "deducao": 106.59},
  {"ate": 8157.41,  "aliquota": 14.0, "deducao": 190.40}
]'::jsonb),
(2026, 'irrf', '[
  {"ate": 2428.80,  "aliquota": 0,    "deducao": 0},
  {"ate": 2826.65,  "aliquota": 7.5,  "deducao": 182.16},
  {"ate": 3751.05,  "aliquota": 15.0, "deducao": 394.16},
  {"ate": 4664.68,  "aliquota": 22.5, "deducao": 675.49},
  {"ate": 999999999,"aliquota": 27.5, "deducao": 908.73}
]'::jsonb);
