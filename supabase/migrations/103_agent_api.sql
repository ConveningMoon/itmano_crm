-- Migration 103: superficie /agent/v1 para agentes externos (CONDUIT).
--
-- Todo aditivo: cuatro tablas nuevas y tres funciones. No toca ninguna tabla,
-- policy ni funcion existente. Ver docs/agent-api/DESIGN.md.

-- ── Tokens de maquina ────────────────────────────────────────────────────────
create table if not exists public.agent_tokens (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null references public.tenants(id) on delete cascade,
  name          text not null,
  token_prefix  text not null,
  token_hash    text not null unique,
  scopes        text[] not null default '{read}',
  bot_user_id   uuid not null references auth.users(id) on delete cascade,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),

  constraint agent_tokens_scopes_valid
    check (scopes <@ array['read','write']::text[] and array_length(scopes, 1) >= 1)
);

create index if not exists agent_tokens_prefix_idx on public.agent_tokens (token_prefix);

alter table public.agent_tokens enable row level security;
-- Sin policies a proposito: deny by default. Solo service_role la toca.

comment on table public.agent_tokens is
  'Tokens de maquina de /agent/v1. RLS activo SIN policies: deny by default.';

-- ── Idempotencia de escrituras ───────────────────────────────────────────────
create table if not exists public.agent_idempotency_keys (
  tenant_id        text not null references public.tenants(id) on delete cascade,
  key              text not null,
  request_hash     text not null,
  state            text not null default 'in_flight'
                   check (state in ('in_flight', 'done')),
  response_status  int,
  response_body    jsonb,
  created_at       timestamptz not null default now(),

  primary key (tenant_id, key)
);

create index if not exists agent_idempotency_created_idx
  on public.agent_idempotency_keys (created_at);

alter table public.agent_idempotency_keys enable row level security;

comment on table public.agent_idempotency_keys is
  'Replay de escrituras de /agent/v1 durante 24h. Misma key con body distinto = 409.';

-- ── Rate limit por token ─────────────────────────────────────────────────────
create table if not exists public.agent_rate_limits (
  token_id      uuid not null references public.agent_tokens(id) on delete cascade,
  bucket        text not null,
  window_start  timestamptz not null,
  count         int not null default 0,

  primary key (token_id, bucket, window_start)
);

alter table public.agent_rate_limits enable row level security;

-- ── Borradores de email ──────────────────────────────────────────────────────
-- Almacenamiento puro. NINGUNA ruta de /agent/v1 envia email.
create table if not exists public.agent_email_drafts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references public.tenants(id) on delete cascade,
  lead_id     text not null references public.leads(id) on delete cascade,
  subject     text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists agent_email_drafts_lead_idx
  on public.agent_email_drafts (tenant_id, lead_id);

alter table public.agent_email_drafts enable row level security;

create policy "tenant isolation: agent_email_drafts" on public.agent_email_drafts
  for all using (tenant_id = get_my_tenant_id());

create policy "super_admin: agent_email_drafts" on public.agent_email_drafts
  for all using (is_super_admin());

comment on table public.agent_email_drafts is
  'Borradores creados por /agent/v1. Nunca se envian desde esa superficie.';

-- ── Minteo de JWT ────────────────────────────────────────────────────────────
-- Autocontenida a proposito: NO llama a rls_jwt_sign ni a rls_test_mint_jwt.
-- Un helper de tests en la ruta de autenticacion se rompe el dia que alguien
-- arregle un test; la duplicacion de diez lineas es el precio del desacople.
--
-- El secreto vive en vault y nunca sale de Postgres: la aplicacion no necesita
-- SUPABASE_JWT_SECRET en su entorno.
create or replace function public.agent_api_base64url(p_data bytea)
returns text
language sql
immutable
as $$
  -- encode(...,'base64') parte la salida en lineas de 76 caracteres; translate
  -- elimina los saltos y el padding, y cambia el alfabeto a base64url.
  select translate(encode(p_data, 'base64'), E'+/=\n\r', '-_');
$$;

create or replace function public.agent_api_mint_jwt(
  p_user_id     uuid,
  p_ttl_seconds int default 900
) returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  v_secret  text;
  v_email   text;
  v_now     bigint := extract(epoch from now())::bigint;
  v_signing text;
begin
  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'agent_api_mint_jwt: no existe el usuario %', p_user_id;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'supabase_jwt_secret' limit 1;

  if v_secret is null then
    raise exception 'agent_api_mint_jwt: supabase_jwt_secret no esta en vault. '
      'Ejecuta: select vault.create_secret(''<jwt secret>'', ''supabase_jwt_secret'');';
  end if;

  v_signing :=
    agent_api_base64url('{"alg":"HS256","typ":"JWT"}'::bytea) || '.' ||
    agent_api_base64url(json_build_object(
      'iss',   'supabase',
      'role',  'authenticated',
      'sub',   p_user_id::text,
      'email', v_email,
      'aud',   'authenticated',
      'iat',   v_now,
      'exp',   v_now + p_ttl_seconds
    )::text::bytea);

  return v_signing || '.' || agent_api_base64url(
    extensions.hmac(v_signing::bytea, v_secret::bytea, 'sha256'));
end;
$$;

revoke all on function public.agent_api_mint_jwt(uuid, int) from public, anon, authenticated;
grant execute on function public.agent_api_mint_jwt(uuid, int) to service_role;

-- ── Rate limit atomico ───────────────────────────────────────────────────────
create or replace function public.agent_api_rate_limit(
  p_token_id uuid,
  p_bucket   text,
  p_limit    int,
  p_window_s int default 60
) returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_s) * p_window_s);
  v_count int;
begin
  insert into public.agent_rate_limits as rl (token_id, bucket, window_start, count)
  values (p_token_id, p_bucket, v_window, 1)
  on conflict (token_id, bucket, window_start)
    do update set count = rl.count + 1
  returning rl.count into v_count;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_window + make_interval(secs => p_window_s);
end;
$$;

revoke all on function public.agent_api_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.agent_api_rate_limit(uuid, text, int, int) to service_role;

-- ── Purga ────────────────────────────────────────────────────────────────────
create or replace function public.agent_api_purge_expired()
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from public.agent_idempotency_keys where created_at   < now() - interval '24 hours';
  delete from public.agent_rate_limits       where window_start < now() - interval '1 hour';
$$;

revoke all on function public.agent_api_purge_expired() from public, anon, authenticated;
grant execute on function public.agent_api_purge_expired() to service_role;
