-- Fase 3 del plan SaaS (docs/plan-saas/fase-03-correo-auth-crons.md): cuotas
-- reales de Resend y correos de Auth medibles. Sólo objetos nuevos y un
-- `create or replace` de platform_totals (misma firma): sin DROP ni cambios en
-- tablas existentes.
--
-- Son tablas de PLATAFORMA: miden las cuentas de Resend que paga ITMANO (y la
-- de A&J), no datos de un tenant. Por eso no llevan tenant_id. Las lee el
-- super_admin (RLS de solo lectura) y las escribe sólo el servidor.

-- ─── Correos enviados por cuenta y día ──────────────────────────────────────
-- Lo suma el wrapper de src/lib/resend.ts en CADA envío real (secuencias,
-- grupales, open houses, one-off, avisos y Magic Links), con la cuenta por la
-- que salió de verdad. email_sends no sirve para la cuota: no registra todos
-- los caminos y atribuye la cuenta por el tenant, no por el envío.
create table if not exists public.resend_usage_daily (
  account text    not null check (account in ('itmano', 'aj')),
  day     date    not null,
  sent    integer not null default 0 check (sent >= 0),
  primary key (account, day)
);

-- ─── Último dato de cuota que dio Resend ────────────────────────────────────
-- Cabeceras x-resend-daily-quota (sólo plan Free) y x-resend-monthly-quota, y
-- el último 429 de cuota. Una fila por cuenta.
create table if not exists public.resend_quota_state (
  account      text        primary key check (account in ('itmano', 'aj')),
  daily_used   integer,
  monthly_used integer,
  headers_at   timestamptz,
  exhausted    text        check (exhausted in ('daily', 'monthly')),
  exhausted_at timestamptz,
  updated_at   timestamptz not null default now()
);

-- ─── Correos de Supabase Auth (Send Email Hook) ─────────────────────────────
-- Tabla propia y no email_sends: no mezcla correos de plataforma con las
-- métricas de los clientes. No guarda la dirección del destinatario: basta el
-- user_id para investigar un caso.
create table if not exists public.auth_email_sends (
  id              bigint      generated always as identity primary key,
  created_at      timestamptz not null default now(),
  action_type     text        not null,
  user_id         uuid,
  resend_email_id text,
  ok              boolean     not null,
  error           text
);

create index if not exists auth_email_sends_created_at_idx
  on public.auth_email_sends (created_at desc);

-- ─── RLS y grants (regla de docs/agents/environments.md) ────────────────────
alter table public.resend_usage_daily enable row level security;
alter table public.resend_quota_state enable row level security;
alter table public.auth_email_sends   enable row level security;

create policy "resend_usage_daily_select_super_admin"
  on public.resend_usage_daily for select to authenticated
  using ((select public.is_super_admin()));
create policy "resend_quota_state_select_super_admin"
  on public.resend_quota_state for select to authenticated
  using ((select public.is_super_admin()));
create policy "auth_email_sends_select_super_admin"
  on public.auth_email_sends for select to authenticated
  using ((select public.is_super_admin()));

revoke all on public.resend_usage_daily, public.resend_quota_state, public.auth_email_sends
  from anon, authenticated;
grant select on public.resend_usage_daily, public.resend_quota_state, public.auth_email_sends
  to authenticated;
grant select, insert, update, delete
  on public.resend_usage_daily, public.resend_quota_state, public.auth_email_sends
  to service_role;

-- ─── record_resend_send: un envío (o un rechazo de cuota) en un solo viaje ──
-- p_sent: correos que Resend aceptó en esta llamada (0 en un rechazo).
-- p_daily_used / p_monthly_used: valor de las cabeceras, null si no llegaron.
-- p_exhausted: 'daily' o 'monthly' si Resend respondió 429 de cuota.
create or replace function public.record_resend_send(
  p_account      text,
  p_sent         integer,
  p_daily_used   integer default null,
  p_monthly_used integer default null,
  p_exhausted    text    default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_has_headers boolean := p_daily_used is not null or p_monthly_used is not null;
begin
  if p_sent > 0 then
    insert into public.resend_usage_daily as u (account, day, sent)
    values (p_account, (now() at time zone 'UTC')::date, p_sent)
    on conflict (account, day) do update set sent = u.sent + excluded.sent;
  end if;

  insert into public.resend_quota_state as s
    (account, daily_used, monthly_used, headers_at, exhausted, exhausted_at, updated_at)
  values
    (p_account, p_daily_used, p_monthly_used, case when v_has_headers then now() end,
     p_exhausted, case when p_exhausted is not null then now() end, now())
  on conflict (account) do update set
    daily_used   = case when v_has_headers then excluded.daily_used   else s.daily_used end,
    monthly_used = case when v_has_headers then excluded.monthly_used else s.monthly_used end,
    headers_at   = case when v_has_headers then now() else s.headers_at end,
    -- Un envío aceptado demuestra que la cuota ya no está agotada.
    exhausted    = case when p_exhausted is not null then p_exhausted
                        when p_sent > 0 then null else s.exhausted end,
    exhausted_at = case when p_exhausted is not null then now()
                        when p_sent > 0 then null else s.exhausted_at end,
    updated_at   = now();
end;
$$;

revoke all on function public.record_resend_send(text, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_resend_send(text, integer, integer, integer, text)
  to service_role;

-- ─── resend_quota_status: lo que necesita la guardia antes de un envío ──────
-- Todo en UTC. Un dato de cabecera o un agotamiento sólo vale dentro de su
-- periodo (el día o el mes en que se observó).
create or replace function public.resend_quota_status(p_account text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select (now() at time zone 'UTC')::date as today,
           date_trunc('month', now() at time zone 'UTC')::date as month_start
  )
  select jsonb_build_object(
    'counted_today', coalesce((select sum(u.sent) from public.resend_usage_daily u, b
                                where u.account = p_account and u.day = b.today), 0),
    'counted_month', coalesce((select sum(u.sent) from public.resend_usage_daily u, b
                                where u.account = p_account and u.day >= b.month_start), 0),
    'header_daily',   (select case when (s.headers_at at time zone 'UTC')::date = b.today
                                   then s.daily_used end
                       from public.resend_quota_state s, b where s.account = p_account),
    'header_monthly', (select case when (s.headers_at at time zone 'UTC')::date >= b.month_start
                                   then s.monthly_used end
                       from public.resend_quota_state s, b where s.account = p_account),
    'exhausted',      (select case
                                when s.exhausted = 'daily'
                                 and (s.exhausted_at at time zone 'UTC')::date = b.today then 'daily'
                                when s.exhausted = 'monthly'
                                 and (s.exhausted_at at time zone 'UTC')::date >= b.month_start then 'monthly'
                              end
                       from public.resend_quota_state s, b where s.account = p_account),
    'daily_quota',    (select ps.daily_quota from public.provider_settings ps
                       where ps.key = 'resend_' || p_account),
    'monthly_quota',  (select ps.monthly_quota from public.provider_settings ps
                       where ps.key = 'resend_' || p_account)
  );
$$;

revoke all on function public.resend_quota_status(text) from public, anon, authenticated;
grant execute on function public.resend_quota_status(text) to service_role;

-- ─── platform_totals: añade la cuota real de Resend y los correos de Auth ───
-- Igual que en 20261118164130_platform_ops.sql, más:
--   'resend':      resend_quota_status de cada cuenta.
--   'auth_emails': correos del Send Email Hook hoy y en el mes.
create or replace function public.platform_totals()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC') as month_start,
           (date_trunc('day',   now() at time zone 'UTC') at time zone 'UTC') as day_start
  )
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage', coalesce((
      select jsonb_object_agg(s.bucket_id, jsonb_build_object('bytes', s.bytes, 'objects', s.objects))
      from (
        select o.bucket_id, sum((o.metadata->>'size')::bigint) as bytes, count(*) as objects
        from storage.objects o group by o.bucket_id
      ) s
    ), '{}'::jsonb),
    'emails', coalesce((
      select jsonb_object_agg(e.account, jsonb_build_object('today', e.today, 'month', e.month))
      from (
        select case when t.resend_account = 'aj' then 'aj' else 'itmano' end as account,
               count(*) filter (where es.created_at >= b.day_start)   as today,
               count(*) filter (where es.created_at >= b.month_start) as month
        from public.email_sends es
        join public.tenants t on t.id = es.tenant_id
        cross join bounds b
        where es.created_at >= b.month_start
        group by 1
      ) e
    ), '{}'::jsonb),
    'resend', jsonb_build_object(
      'itmano', public.resend_quota_status('itmano'),
      'aj',     public.resend_quota_status('aj')
    ),
    'auth_emails', (
      select jsonb_build_object(
        'today', count(*) filter (where a.ok and a.created_at >= b.day_start),
        'month', count(*) filter (where a.ok),
        'failed_today', count(*) filter (where not a.ok and a.created_at >= b.day_start)
      )
      from public.auth_email_sends a, bounds b
      where a.created_at >= b.month_start
    ),
    'domains', coalesce((
      select jsonb_object_agg(d.account, d.used)
      from (
        select case when t.resend_account = 'aj' then 'aj' else 'itmano' end as account,
               count(*) filter (where t.sending_domain is not null) as used
        from public.tenants t group by 1
      ) d
    ), '{}'::jsonb),
    'ai_month', coalesce((
      select jsonb_object_agg(a.provider, a.usd)
      from (
        select case when x.model ilike 'gemini%' then 'google_ai' else 'anthropic' end as provider,
               sum(x.cost_usd) as usd
        from public.ai_usage_events x, bounds b
        where x.created_at >= b.month_start
        group by 1
      ) a
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.platform_totals() from public, anon, authenticated;
grant execute on function public.platform_totals() to service_role;
