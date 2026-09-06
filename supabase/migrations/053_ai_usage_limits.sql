-- 053 · Límite mensual de uso de IA por tenant.
--
-- El costo de la IA lo paga ITMANO, así que cada tenant tiene un tope mensual
-- (mes calendario, USD) sobre la suma de ai_usage_events.cost_usd. El
-- super_admin lo administra desde el Centro de control: puede cambiar el monto
-- por tenant o marcarlo como ilimitado. El enforcement vive en
-- src/lib/services/ai-limit.ts y se aplica ANTES de cada llamada a la Claude
-- API; el super_admin siempre pasa (bypass en código).

alter table tenants
  add column if not exists ai_monthly_limit_usd numeric(8, 2) not null default 10.00,
  add column if not exists ai_unlimited         boolean       not null default false;

alter table tenants
  add constraint tenants_ai_limit_positive check (ai_monthly_limit_usd >= 0);
