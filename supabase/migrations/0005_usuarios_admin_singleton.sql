-- During bootstrap, ensure at most one user has role='admin' so that the
-- first-login flow assigns admin to exactly the first user.
-- After bootstrap, an admin can be promoted manually only by another admin
-- (RLS already enforces who can update roles).
create unique index usuarios_admin_singleton
  on public.usuarios (role)
  where role = 'admin';

comment on index public.usuarios_admin_singleton is
  'Bootstrap-time invariant: at most one admin user. Promoting a second admin requires dropping/recreating this index manually.';
