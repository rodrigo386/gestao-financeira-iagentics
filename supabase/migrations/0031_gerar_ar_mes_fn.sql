-- AR generation for a reference month, DB-side. Usado pelo agendamento mensal
-- (pg_cron) no cloud, independente do app Next.js e sem depender de CRON_SECRET.
--
-- Espelha a regra de src/modules/contas-receber/gerador.ts:gerarARDoContrato:
--   contrato 'ativo', já iniciado até o mês de referência e ainda não encerrado;
--   valor mensal (anual => ticket/12); vencimento no dia_cobranca, limitado ao
--   último dia do mês. Idempotente: dedup pelo índice único (migration 0010).
--
-- NOTA: a regra existe em dois lugares (este SQL p/ o cron agendado + o TS p/ o
-- botão "Gerar AR do mês" e o endpoint /api/cron/gerar-ar). Mantê-los em sincronia
-- se a regra de faturamento mudar.
create or replace function public.gerar_ar_mes(ref_month date)
returns integer
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  inicio_mes date := date_trunc('month', ref_month)::date;
  ult_dia integer := extract(day from (date_trunc('month', ref_month) + interval '1 month - 1 day'))::int;
  inseridas integer;
begin
  with novos as (
    insert into public.contas_a_receber
      (cliente_id, origem, origem_id, valor, moeda, data_emissao, data_vencimento, status)
    select c.cliente_id, 'contrato', c.id,
           case when c.tipo = 'anual' then c.ticket / 12 else c.ticket end,
           c.moeda,
           inicio_mes,
           make_date(extract(year from inicio_mes)::int, extract(month from inicio_mes)::int,
                     least(c.dia_cobranca, ult_dia)),
           'previsto'
    from public.contratos c
    where c.status = 'ativo'
      and c.data_inicio <= inicio_mes
      and (c.data_fim is null or c.data_fim >= inicio_mes)
    on conflict do nothing
    returning 1
  )
  select count(*) into inseridas from novos;
  return inseridas;
end;
$$;
