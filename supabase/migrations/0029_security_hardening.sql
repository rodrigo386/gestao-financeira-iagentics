-- Security hardening from the Supabase database linter (applied to cloud on deploy).
-- 1) Pin search_path on trigger functions (the helper fns already set it).
alter function public.tg_set_atualizado_em() set search_path = pg_catalog, public;
alter function public.check_milestone_total() set search_path = pg_catalog, public;

-- 2) The role helpers are for RLS only (policies are `to authenticated`). Remove the
--    unauthenticated RPC exposure: revoke EXECUTE from anon. `authenticated` keeps it
--    because RLS policies invoke these functions as the querying (authenticated) role.
revoke execute on function public.is_admin() from anon;
revoke execute on function public.current_role() from anon;
revoke execute on function public.can_write() from anon;
