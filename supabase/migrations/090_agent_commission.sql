-- 090 — Comisión por agente.
--
-- Cada agente negocia su split, así que la comisión es suya, no de la agencia.
-- Los rangos de presupuesto y las zonas NO se mueven aquí a propósito: definen
-- cómo se MIDE la calidad de un lead, y esa vara tiene que ser una sola para
-- todo el tenant o los quintiles dejan de comparar lo mismo. Un lead no puede
-- valer distinto según a quién se le asigne después.
--
-- Nullable: null = hereda la del tenant. Así un Partner sólo declara las
-- excepciones, y un tenant de un solo agente no toca nada.
alter table agents add column if not exists commission_model text
  check (commission_model in ('percentage','flat'));
alter table agents add column if not exists commission_buy  numeric;
alter table agents add column if not exists commission_sell numeric;

comment on column agents.commission_model is
  'Modelo de comisión de ESTE agente. null = hereda el del tenant.';
