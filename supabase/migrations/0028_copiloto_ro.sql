-- Read-only role for the copiloto SQL sandbox. The role's GRANTs are the real
-- privilege barrier; transaction read-only + statement_timeout are defense-in-depth.
do $$
begin
  if not exists (select from pg_roles where rolname = 'copiloto_ro') then
    create role copiloto_ro with login password 'copiloto_ro_dev' nosuperuser nocreatedb nocreaterole;
  end if;
end $$;

alter role copiloto_ro set default_transaction_read_only = on;
alter role copiloto_ro set statement_timeout = '5s';

grant usage on schema public to copiloto_ro;

grant select on
  public.clientes, public.contratos, public.projetos, public.milestones,
  public.contas_a_receber, public.contas_a_pagar, public.lancamentos,
  public.despesas_recorrentes, public.fornecedores, public.categorias,
  public.funcionarios, public.pj_spot, public.alocacoes_pj, public.folha,
  public.itens_folha, public.holerites, public.forecast_cenarios,
  public.forecast_projecoes, public.metricas_mensais, public.alertas,
  public.contas_bancarias, public.regras_categorizacao,
  public.sugestoes_conciliacao, public.tabelas_fiscais, public.organizacao
  to copiloto_ro;

-- Intentionally NOT granted: usuarios (auth), audit_log (audit), pluggy_items (credentials).
