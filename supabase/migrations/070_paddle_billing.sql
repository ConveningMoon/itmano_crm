-- 070 · Paddle Billing (fase Comercialización → Billing).
--
-- La migración 054 anticipaba: "cuando llegue el billing real, esta tabla gana
-- las columnas del proveedor sin romper nada". Esto es eso.
--
-- Modelo: Esencial y Growth se compran con un botón (precio estándar en env);
-- Partner se negocia y su precio a medida vive en paddle_price_id. El trial
-- sigue FUERA de Paddle (registro operativo del super_admin).

alter table subscriptions
  add column if not exists billing_cycle          text,
  add column if not exists paddle_customer_id     text,
  add column if not exists paddle_subscription_id text,
  add column if not exists paddle_price_id        text,
  add column if not exists current_period_end     timestamptz,
  add column if not exists cancel_at              timestamptz,
  add column if not exists billing_exempt         boolean not null default false,
  add column if not exists degraded_at            timestamptz,
  add column if not exists last_event_at          timestamptz;

alter table subscriptions drop constraint if exists subscriptions_billing_cycle_check;
alter table subscriptions add constraint subscriptions_billing_cycle_check
  check (billing_cycle is null or billing_cycle in ('month', 'year'));

-- Una suscripción de Paddle pertenece a un solo tenant.
create unique index if not exists subscriptions_paddle_subscription_id_key
  on subscriptions (paddle_subscription_id)
  where paddle_subscription_id is not null;

-- Estados nuevos: past_due y paused llegan de Paddle. cancel_requested y
-- change_requested se CONSERVAN: siguen sirviendo para Partner, que se negocia.
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('trial', 'active', 'past_due', 'paused',
                    'cancel_requested', 'change_requested', 'cancelled'));

-- A&J Real Estate: piloto en cortesía, nunca toca Paddle.
-- OJO: el id del tenant es 'tenant-aj'. 'aj-real-estate' es el SLUG, no el id —
-- usarlo aquí no coincidiría con ninguna fila y la exención fallaría en silencio.
-- Verificado contra la base el 2026-07-27.
update subscriptions set billing_exempt = true where tenant_id = 'tenant-aj';

-- ── Registro de eventos de webhook ───────────────────────────────────────────
-- Doble función: deduplicar el at-least-once de Paddle (event_id como PK) y
-- dejar traza de auditoría para cuando un cobro no cuadre.
create table if not exists paddle_webhook_events (
  event_id     text        primary key,
  event_type   text        not null,
  occurred_at  timestamptz not null,
  tenant_id    text        references tenants(id) on delete set null,
  payload      jsonb       not null,
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists paddle_webhook_events_tenant_idx
  on paddle_webhook_events (tenant_id, occurred_at desc);

alter table paddle_webhook_events enable row level security;

-- Solo ITMANO ve el log de cobros. Escrituras solo por service role.
create policy "paddle_webhook_events_select"
  on paddle_webhook_events for select
  using (is_super_admin());

-- ── Propiedades despublicadas por impago ─────────────────────────────────────
-- Imprescindible para la reactivación: sin este flag no se puede distinguir una
-- propiedad que despublicó el sistema de una que el cliente despublicó a
-- propósito, y se le republicaría una casa ya vendida.
alter table properties
  add column if not exists unpublished_by_billing boolean not null default false;
