-- organizacao single row
insert into public.organizacao (nome, cnpj, regime_tributario, moeda_padrao)
values ('IAgentics', null, 'simples', 'BRL')
on conflict do nothing;

-- dev admin user (must exist in auth.users first; created via supabase auth signup or magic link)
-- nothing to seed here; usuarios row is auto-created on first login (see Task 12 callback)
