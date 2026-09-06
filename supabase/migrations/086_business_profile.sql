-- 086 — Perfil de negocio del tenant.
--
-- Lo que una agencia sabe de su propio mercado y el CRM no: cuánto cobra por
-- operación y qué significa "presupuesto premium" en su zona.
--
-- El segundo dato es el importante. `budget_tier` (premium / mid / entry) ya se
-- usa en el fit, y el prompt de la IA le dice literalmente que ese nivel es
-- "RELATIVO al mercado de la agencia"... sin darle jamás los números de esa
-- agencia. Un presupuesto de 300k es de entrada en Barcelona y premium en
-- Hampton Roads, y hasta ahora el sistema resolvía esa diferencia adivinando.
--
-- La comisión habilita el peso por valor de la operación: dos leads con la
-- misma calidad no valen lo mismo si uno compra el doble.
--
-- Todo NULLABLE a propósito. Un tenant sin perfil se comporta exactamente como
-- hasta ahora; nada en el motor depende de que esté relleno. Es información que
-- mejora las decisiones cuando existe, no un requisito para operar.

alter table public.tenants
  add column currency            text,
  add column commission_model    text,
  add column commission_buy      numeric(10,2),
  add column commission_sell     numeric(10,2),
  add column budget_entry_max    numeric(14,2),
  add column budget_premium_min  numeric(14,2);

alter table public.tenants
  add constraint tenants_currency_check
    check (currency is null or currency in ('USD', 'EUR')),
  add constraint tenants_commission_model_check
    check (commission_model is null or commission_model in ('percentage', 'flat')),
  -- En modelo porcentaje los valores son un %; el tope evita el dedazo de
  -- escribir 3000 donde iba 3.
  add constraint tenants_commission_buy_check
    check (commission_buy is null or commission_buy >= 0),
  add constraint tenants_commission_sell_check
    check (commission_sell is null or commission_sell >= 0),
  -- Los cortes tienen que dejar sitio al rango medio: sin esto se puede guardar
  -- un perfil donde "entrada" llega más arriba que donde empieza "premium", y
  -- el bucket de en medio desaparece sin ningún aviso.
  add constraint tenants_budget_bands_check
    check (
      budget_entry_max is null
      or budget_premium_min is null
      or budget_entry_max < budget_premium_min
    );

comment on column public.tenants.currency is
  'Moneda del perfil de negocio. Null = sin perfil configurado.';
comment on column public.tenants.commission_model is
  'percentage = commission_* son un %; flat = son un monto por operación.';
comment on column public.tenants.budget_entry_max is
  'Hasta este monto, el presupuesto del lead es de "entrada" para esta agencia.';
comment on column public.tenants.budget_premium_min is
  'Desde este monto, "premium". Entre ambos cortes, "mid".';
