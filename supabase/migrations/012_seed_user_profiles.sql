-- Migration 012: seed user_profiles for initial production users
--
-- Inserts rows for Adriana (agent_owner, tenant-aj) and Dylan (super_admin).
-- Safe to re-run: ON CONFLICT (id) DO UPDATE means existing rows are refreshed.
-- If a user hasn't logged in yet (no auth.users row), a NOTICE is raised and
-- that user is skipped. Re-run the migration after their first Magic Link login.
--
-- user_profiles.id is the same UUID as auth.users.id (no separate user_id column).

do $$
declare
  v_adriana_id uuid;
  v_dylan_id   uuid;
begin
  select id into v_adriana_id
  from   auth.users
  where  email = 'adrysofirealestate@gmail.com';

  select id into v_dylan_id
  from   auth.users
  where  email = 'dj.vergara@hotmail.com';

  if v_adriana_id is null then
    raise notice 'user_profiles seed: adrysofirealestate@gmail.com not in auth.users yet — skipped';
  else
    insert into user_profiles (id, role, tenant_id)
    values (v_adriana_id, 'agent_owner', 'tenant-aj')
    on conflict (id) do update
      set role      = excluded.role,
          tenant_id = excluded.tenant_id;
    raise notice 'user_profiles seed: upserted agent_owner for adrysofirealestate@gmail.com';
  end if;

  if v_dylan_id is null then
    raise notice 'user_profiles seed: dj.vergara@hotmail.com not in auth.users yet — skipped';
  else
    insert into user_profiles (id, role, tenant_id)
    values (v_dylan_id, 'super_admin', null)
    on conflict (id) do update
      set role      = excluded.role,
          tenant_id = excluded.tenant_id;
    raise notice 'user_profiles seed: upserted super_admin for dj.vergara@hotmail.com';
  end if;
end $$;
