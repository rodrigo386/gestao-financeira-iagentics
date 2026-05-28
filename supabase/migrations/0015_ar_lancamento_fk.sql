alter table public.contas_a_receber
  add constraint contas_a_receber_lancamento_id_fkey
  foreign key (lancamento_id)
  references public.lancamentos(id)
  on delete set null;

-- AR recebido invariant: must have lancamento_id
-- (we can't add this constraint via ALTER if there are existing rows with status=recebido and null lancamento_id,
--  but in our case all data was reset via db reset and any test rows were transient)
alter table public.contas_a_receber
  add constraint ar_recebido_requer_lancamento check (
    (status <> 'recebido') or (lancamento_id is not null)
  );
