-- Fase 6: límites del plan en código.
--
-- 1. `expired`: estado de una prueba que venció sin pasar a un plan de pago.
--    Es texto con CHECK (no enum), así que basta con reemplazar la restricción;
--    conserva todos los estados de la 070 y añade 'expired'.
-- 2. `over_cap_since`: desde cuándo el tenant está por encima del tope de
--    propiedades de su plan. Arranca la gracia (GRACE_DAYS.properties).

alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('trial', 'active', 'past_due', 'paused', 'expired',
                    'cancel_requested', 'change_requested', 'cancelled'));

alter table subscriptions add column if not exists over_cap_since timestamptz;

comment on column subscriptions.over_cap_since is
  'Momento en que el tenant superó el tope de propiedades de su plan; null si no está por encima. La gracia de GRACE_DAYS.properties días corre desde aquí.';
