-- 061 · Opciones de creación de página por fuente/propiedad.
--
-- Cada fuente (y propiedad) puede: (1) alojarse en ITMANO (constructor 060),
-- (2) embeberse en la web propia del tenant, o (3) solicitarse a ITMANO
-- (platform_requests kind='page' → tab Páginas en /solicitudes).
--
-- page_managed_by_itmano: el super_admin la marca cuando conecta la página
-- manualmente para un tenant que gestiona en persona — el tenant deja de ver
-- las opciones de construcción para ese elemento.

alter table acquisition_channels
  add column if not exists page_managed_by_itmano boolean not null default false;

alter table properties
  add column if not exists page_managed_by_itmano boolean not null default false;

alter table platform_requests drop constraint if exists platform_requests_kind_check;
alter table platform_requests add constraint platform_requests_kind_check
  check (kind in ('contact', 'support', 'page'));
