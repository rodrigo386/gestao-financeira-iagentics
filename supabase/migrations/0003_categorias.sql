create type categoria_tipo as enum ('receita', 'despesa', 'transferencia');

create table public.categorias (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  tipo      categoria_tipo not null,
  parent_id uuid references public.categorias(id) on delete restrict,
  cor       text,
  icone     text,
  ativa     boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (nome, parent_id)
);

create index categorias_tipo on public.categorias (tipo) where ativa;
create index categorias_parent on public.categorias (parent_id);

alter table public.categorias enable row level security;

create policy "categorias_select_authenticated"
  on public.categorias for select
  to authenticated using (true);

create policy "categorias_modify_can_write"
  on public.categorias for all
  to authenticated
  using (public.can_write())
  with check (public.can_write());

-- standard chart of accounts (small Brazilian SaaS startup)
insert into public.categorias (nome, tipo) values
  ('Receita Recorrente (AaaS)', 'receita'),
  ('Receita de Projetos', 'receita'),
  ('Outras Receitas', 'receita'),
  ('Pessoal', 'despesa'),
  ('Operacional', 'despesa'),
  ('Marketing e Vendas', 'despesa'),
  ('Tecnologia', 'despesa'),
  ('Administrativo', 'despesa'),
  ('Impostos e Encargos', 'despesa'),
  ('Financeiras', 'despesa');

-- children
with parents as (select id, nome from public.categorias where parent_id is null)
insert into public.categorias (nome, tipo, parent_id)
select sub.nome, sub.tipo::categoria_tipo, p.id
from (values
  ('Salário CLT',        'despesa', 'Pessoal'),
  ('Pró-labore',         'despesa', 'Pessoal'),
  ('PJ Recorrente',      'despesa', 'Pessoal'),
  ('PJ Spot',            'despesa', 'Pessoal'),
  ('FGTS',               'despesa', 'Pessoal'),
  ('INSS Patronal',      'despesa', 'Pessoal'),
  ('VR/VA',              'despesa', 'Pessoal'),
  ('Plano de Saúde',     'despesa', 'Pessoal'),
  ('Provisão 13º',       'despesa', 'Pessoal'),
  ('Provisão Férias',    'despesa', 'Pessoal'),
  ('Aluguel',            'despesa', 'Operacional'),
  ('Coworking',          'despesa', 'Operacional'),
  ('Anúncios Pagos',     'despesa', 'Marketing e Vendas'),
  ('Eventos',            'despesa', 'Marketing e Vendas'),
  ('Contratos Software', 'despesa', 'Tecnologia'),
  ('LLM/API',            'despesa', 'Tecnologia'),
  ('Cloud',              'despesa', 'Tecnologia'),
  ('Contabilidade',      'despesa', 'Administrativo'),
  ('Jurídico',           'despesa', 'Administrativo'),
  ('Simples Nacional (DAS)', 'despesa', 'Impostos e Encargos'),
  ('Tarifas Bancárias',  'despesa', 'Financeiras'),
  ('Juros e IOF',        'despesa', 'Financeiras')
) as sub(nome, tipo, parent_nome)
join parents p on p.nome = sub.parent_nome;
