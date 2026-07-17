-- 055 · Período de prueba (trial) en subscriptions.
--
-- Gancho de adquisición sales-led: un tenant nuevo puede arrancar con la
-- experiencia Partner completa por 14 días (src/lib/plans.ts → TRIAL). El
-- trial vive como plan='partner' + status='trial' + trial_ends_at. El
-- super_admin lo crea/extiende desde el Centro de control; al convertir, fija
-- el plan definitivo con status='active' y trial_ends_at=null. Sin lockout
-- automático al vencer (modelo sales-led): el Centro de control marca la
-- prueba vencida y el equipo gestiona la conversión.

alter table subscriptions
  add column if not exists trial_ends_at timestamptz;

alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('trial', 'active', 'cancel_requested', 'change_requested', 'cancelled'));

-- Coherencia: un trial siempre tiene vencimiento; los demás estados no lo usan.
alter table subscriptions drop constraint if exists subscriptions_trial_ends_at_coherent;
alter table subscriptions add constraint subscriptions_trial_ends_at_coherent
  check ((status = 'trial') = (trial_ends_at is not null));
