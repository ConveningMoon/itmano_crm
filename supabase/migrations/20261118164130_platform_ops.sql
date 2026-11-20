-- Panel de operación (fase 2 del plan SaaS, docs/plan-saas/fase-02-panel-operacion.md).
-- Sólo objetos nuevos: sin DROP ni cambios en tablas existentes.
--
-- Son tablas de PLATAFORMA, no de un tenant: miden lo que paga o aporta ITMANO
-- (cuotas de Resend, saldo de IA, Storage, crons). Por eso no llevan tenant_id
-- obligatorio. platform_metrics lo lleva NULLABLE para las métricas por tenant.
--
-- Acceso: las lee el super_admin (RLS de solo lectura como segunda capa; el
-- Centro de control lee con el admin client tras comprobar el rol) y las
-- escribe sólo el servidor con service_role.

-- ─── Latido de cada cron y webhook ──────────────────────────────────────────
-- Una fila por job, no un historial: `warm` corre cada minuto. Se escribe al
-- terminar; un job que muere a la mitad no escribe y su latido envejece, que es
-- exactamente lo que el panel detecta.
create table if not exists public.cron_heartbeats (
  job                  text        primary key,
  last_run_at          timestamptz not null,
  last_ok              boolean     not null,
  last_ok_at           timestamptz,
  last_duration_ms     integer,
  last_error           text,
  last_detail          jsonb,
  consecutive_failures integer     not null default 0
);

-- ─── Lo que ITMANO contrata y el sistema no puede leer ──────────────────────
-- Lo escribe a mano el super_admin desde /admin/operacion. Todo es opcional: un
-- valor vacío significa "no configurado" y el panel lo muestra como tal, nunca
-- como cero.
create table if not exists public.provider_settings (
  key                 text        primary key,
  label               text        not null,
  plan                text,
  monthly_cost_usd    numeric(10,2),
  monthly_budget_usd  numeric(10,2),
  daily_quota         integer,
  monthly_quota       integer,
  domain_slots        integer,
  balance_usd         numeric(12,4),
  balance_recorded_at timestamptz,
  renews_on           date,
  key_expires_on      date,
  last_backup_at      timestamptz,
  notes               text,
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);

insert into public.provider_settings (key, label) values
  ('resend_itmano', 'Resend · cuenta ITMANO'),
  ('resend_aj',     'Resend · cuenta A&J'),
  ('anthropic',     'Anthropic (Claude)'),
  ('google_ai',     'Google AI (Gemini)'),
  ('supabase',      'Supabase'),
  ('vercel',        'Vercel'),
  ('paddle',        'Paddle'),
  ('dominio',       'Dominio itmano.com')
on conflict (key) do nothing;

-- ─── Foto diaria de métricas ────────────────────────────────────────────────
-- La escribe el cron /api/cron/platform-ops. tenant_id null = métrica de
-- plataforma; account distingue cuentas de un mismo proveedor (Resend).
create table if not exists public.platform_metrics (
  id          bigint      generated always as identity primary key,
  captured_at timestamptz not null default now(),
  provider    text        not null,
  metric      text        not null,
  account     text,
  tenant_id   text        references public.tenants(id) on delete cascade,
  value       numeric     not null,
  limit_value numeric,
  unit        text        not null
);

create index if not exists platform_metrics_lookup_idx
  on public.platform_metrics (provider, metric, captured_at desc);
create index if not exists platform_metrics_tenant_idx
  on public.platform_metrics (tenant_id, captured_at desc)
  where tenant_id is not null;
create index if not exists platform_metrics_captured_at_idx
  on public.platform_metrics (captured_at);

-- ─── Alertas enviadas (deduplicación) ───────────────────────────────────────
-- Una alerta por (clave, periodo): el cron diario no repite el mismo aviso
-- cada día. El periodo lo decide el código (día, mes o fecha de vencimiento).
create table if not exists public.platform_alerts (
  id        bigint      generated always as identity primary key,
  alert_key text        not null,
  period    text        not null,
  severity  text        not null check (severity in ('warn', 'critical')),
  message   text        not null,
  delivered boolean     not null default false,
  sent_at   timestamptz not null default now(),
  unique (alert_key, period)
);

create index if not exists platform_alerts_sent_at_idx
  on public.platform_alerts (sent_at desc);

-- ─── RLS y grants (regla de docs/agents/environments.md) ────────────────────
alter table public.cron_heartbeats   enable row level security;
alter table public.provider_settings enable row level security;
alter table public.platform_metrics  enable row level security;
alter table public.platform_alerts   enable row level security;

create policy "cron_heartbeats_select_super_admin"
  on public.cron_heartbeats for select to authenticated
  using ((select public.is_super_admin()));
create policy "provider_settings_select_super_admin"
  on public.provider_settings for select to authenticated
  using ((select public.is_super_admin()));
create policy "platform_metrics_select_super_admin"
  on public.platform_metrics for select to authenticated
  using ((select public.is_super_admin()));
create policy "platform_alerts_select_super_admin"
  on public.platform_alerts for select to authenticated
  using ((select public.is_super_admin()));

-- authenticated: SELECT (RLS decide; sólo super_admin ve filas). Las escrituras
-- van por el servidor, así que no recibe INSERT/UPDATE/DELETE.
revoke all on public.cron_heartbeats, public.provider_settings,
              public.platform_metrics, public.platform_alerts from anon, authenticated;
grant select on public.cron_heartbeats, public.provider_settings,
                public.platform_metrics, public.platform_alerts to authenticated;
grant select, insert, update, delete on public.cron_heartbeats, public.provider_settings,
                public.platform_metrics, public.platform_alerts to service_role;

-- ─── record_heartbeat: upsert atómico del latido ────────────────────────────
create or replace function public.record_heartbeat(
  p_job         text,
  p_ok          boolean,
  p_duration_ms integer default null,
  p_error       text    default null,
  p_detail      jsonb   default null
) returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.cron_heartbeats as h
    (job, last_run_at, last_ok, last_ok_at, last_duration_ms, last_error, last_detail, consecutive_failures)
  values
    (p_job, now(), p_ok, case when p_ok then now() end, p_duration_ms,
     case when p_ok then null else left(p_error, 500) end, p_detail,
     case when p_ok then 0 else 1 end)
  on conflict (job) do update set
    last_run_at          = excluded.last_run_at,
    last_ok              = excluded.last_ok,
    last_ok_at           = coalesce(excluded.last_ok_at, h.last_ok_at),
    last_duration_ms     = excluded.last_duration_ms,
    last_error           = excluded.last_error,
    last_detail          = excluded.last_detail,
    consecutive_failures = case when excluded.last_ok then 0 else h.consecutive_failures + 1 end;
$$;

revoke all on function public.record_heartbeat(text, boolean, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_heartbeat(text, boolean, integer, text, jsonb) to service_role;

-- ─── platform_usage: uso actual de cada tenant ──────────────────────────────
-- Una fila por tenant. El mes es el calendario en UTC, igual que el tope de IA
-- (src/lib/services/ai-limit.ts). Los archivos de Storage viven bajo una
-- carpeta con el id del tenant (`tenant-…/…`).
create or replace function public.platform_usage()
returns table (
  tenant_id      text,
  leads          bigint,
  agents         bigint,
  logins         bigint,
  web_properties bigint,
  emails_today   bigint,
  emails_month   bigint,
  ai_usd_month   numeric,
  storage_bytes  bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC') as month_start,
           (date_trunc('day',   now() at time zone 'UTC') at time zone 'UTC') as day_start
  )
  select
    t.id,
    (select count(*) from public.leads l where l.tenant_id = t.id),
    (select count(*) from public.agents a where a.tenant_id = t.id),
    (select count(*) from public.user_profiles u
       where u.tenant_id = t.id and u.role in ('agent_owner', 'agent')),
    (select count(*) from public.properties p
       where p.tenant_id = t.id and p.published_to_web),
    (select count(*) from public.email_sends e, bounds b
       where e.tenant_id = t.id and e.created_at >= b.day_start),
    (select count(*) from public.email_sends e, bounds b
       where e.tenant_id = t.id and e.created_at >= b.month_start),
    (select coalesce(sum(x.cost_usd), 0) from public.ai_usage_events x, bounds b
       where x.tenant_id = t.id and x.created_at >= b.month_start),
    (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
       where split_part(o.name, '/', 1) = t.id)
  from public.tenants t;
$$;

revoke all on function public.platform_usage() from public, anon, authenticated;
grant execute on function public.platform_usage() to service_role;

-- ─── platform_totals: métricas de plataforma ────────────────────────────────
-- Correos por cuenta de Resend (por el resend_account del tenant), gasto de IA
-- por proveedor, tamaño de la base y Storage por bucket. Los Magic Links de
-- Auth no pasan por email_sends: los cuenta la fase 3.
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

-- ─── ai_spend_since: gasto registrado desde una fecha ───────────────────────
-- Para el saldo estimado: saldo anotado − gasto desde que se anotó.
create or replace function public.ai_spend_since(p_provider text, p_since timestamptz)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(x.cost_usd), 0)
  from public.ai_usage_events x
  where x.created_at >= p_since
    and (case when x.model ilike 'gemini%' then 'google_ai' else 'anthropic' end) = p_provider;
$$;

revoke all on function public.ai_spend_since(text, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_spend_since(text, timestamptz) to service_role;
