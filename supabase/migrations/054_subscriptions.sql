-- 054 · Suscripciones por tenant (fase Comercialización, pre-billing).
--
-- Modelo sales-led: todavía NO hay procesador de pagos (Stripe/Lemon Squeezy
-- pendiente en el roadmap), así que la suscripción es un registro operativo:
--   - El plan del tenant lo administra el super_admin desde el Centro de control.
--   - El owner puede SOLICITAR un cambio de plan o la cancelación desde
--     Configuración; eso marca la solicitud y notifica a ITMANO (notification
--     tipo 'subscription_request' → bell + Telegram), y el equipo la gestiona.
-- Cuando llegue el billing real, esta tabla gana las columnas del proveedor
-- (customer_id, subscription_id, current_period_end...) sin romper nada.

create table if not exists subscriptions (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      text        not null unique references tenants(id) on delete cascade,
  -- Planes públicos de la landing: Esencial $149 · Growth $299 · Partner (custom)
  plan           text        not null default 'esencial'
                             check (plan in ('esencial', 'growth', 'partner')),
  status         text        not null default 'active'
                             check (status in ('active', 'cancel_requested', 'change_requested', 'cancelled')),
  -- Plan solicitado por el owner cuando status = 'change_requested'.
  requested_plan text        check (requested_plan in ('esencial', 'growth', 'partner')),
  started_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

alter table subscriptions enable row level security;

-- Lectura scoped por tenant (mismo patrón que el resto de tablas). Escrituras
-- solo vía service role (server actions) — sin políticas de insert/update.
create policy "subscriptions_select"
  on subscriptions for select
  using (is_super_admin() or tenant_id = get_my_tenant_id());

-- Seed: todos los tenants existentes arrancan en Growth (el plan del piloto
-- A&J). El super_admin lo ajusta por tenant desde el Centro de control.
insert into subscriptions (tenant_id, plan)
select id, 'growth' from tenants
on conflict (tenant_id) do nothing;

-- Notificación de solicitudes de suscripción → extender el CHECK de types.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array[
    'score_threshold', 'contact_form_question', 'lead_created', 'hot_lead',
    'lead_deleted', 'event_added', 'event_deleted', 'lm_added', 'lm_deleted',
    'contact_us', 'event_submission', 'email_replied',
    'subscription_request'
  ]));
