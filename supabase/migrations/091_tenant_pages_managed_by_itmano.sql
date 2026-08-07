-- 091 · "Administrado por ITMANO" pasa a ser del tenant, no de cada página.
--
-- La 061 puso page_managed_by_itmano en cada fuente y en cada propiedad: el
-- super_admin tenía que marcarlas una por una y cada elemento nuevo nacía sin
-- marcar, así que un tenant gestionado en persona volvía a ver el constructor
-- cada vez que creaba una fuente. La decisión no es del elemento sino del
-- cliente: si ITMANO le gestiona las páginas, se las gestiona todas.
--
-- El mismo flag cierra el dominio de envío: a un tenant gestionado por ITMANO no
-- se le configura dominio propio, sus correos salen por el compartido.

alter table tenants
  add column if not exists pages_managed_by_itmano boolean not null default false;

comment on column tenants.pages_managed_by_itmano is
  'ITMANO gestiona las páginas (fuentes y propiedades) y el dominio de envío de este tenant.';

-- Backfill: un tenant con aunque sea una página marcada bajo el modelo por fila
-- queda gestionado por completo.
update tenants t
set pages_managed_by_itmano = true
where exists (
        select 1 from acquisition_channels c
        where c.tenant_id = t.id and c.page_managed_by_itmano
      )
   or exists (
        select 1 from properties p
        where p.tenant_id = t.id and p.page_managed_by_itmano
      );

alter table acquisition_channels drop column if exists page_managed_by_itmano;
alter table properties           drop column if exists page_managed_by_itmano;
