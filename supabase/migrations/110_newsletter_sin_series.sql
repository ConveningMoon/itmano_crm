-- 110 · Newsletters sin series.
--
-- La serie deja de ser algo que el usuario ve. El canal NO desaparece: sigue
-- sosteniendo el formulario de suscripción, la atribución de leads y el vínculo
-- con la secuencia. Lo que cambia es que lo crea el sistema y hay UNO por
-- tenant. Por eso aquí no se borra nada: se añade el índice que hace imposible
-- un segundo canal de newsletter por tenant, y las dos columnas nuevas.

-- 1) Un solo canal de newsletter por tenant. Parcial, para no estorbar al resto
--    de tipos de canal, y sin tocar los archivados (que ya no cuentan).
create unique index if not exists acquisition_channels_una_newsletter_por_tenant
  on public.acquisition_channels (tenant_id)
  where channel_type = 'newsletter' and archived_at is null;

-- 2) Categoría de la edición: etiqueta para el lector.
alter table public.newsletter_editions
  add column if not exists category text not null default 'informativo';

alter table public.newsletter_editions
  drop constraint if exists newsletter_editions_category_check;
alter table public.newsletter_editions
  add constraint newsletter_editions_category_check
  check (category = any (array['informativo','educativo','analisis','anuncio']));

comment on column public.newsletter_editions.category is
  'Tipo de contenido de la edición, para el lector. No agrupa público ni
   secuencia: eso sería una serie, que es justo lo que esta migración retira.';

-- 3) Vistas por EDICIÓN. channel_page_views ya cuenta vistas por canal, pero
--    con una sola newsletter por tenant ese número deja de decir nada útil:
--    lo que hay que comparar es qué edición se lee. Nullable porque las vistas
--    de los demás canales (lead magnets, eventos) no tienen edición.
alter table public.channel_page_views
  add column if not exists edition_id uuid
  references public.newsletter_editions(id) on delete cascade;

create index if not exists channel_page_views_edition_idx
  on public.channel_page_views (edition_id)
  where edition_id is not null;

-- Sin grant a `anon` aquí: el beacon de vistas (`/api/intake/[publicId]/view`)
-- escribe con `createAdminClient()` (service_role), nunca con la clave anónima.
-- Y aunque `anon` insertara, la policy `channel_page_views_insert` (migración
-- 003) exige `is_super_admin() OR tenant_id = get_my_tenant_id()`, que `anon`
-- no cumple nunca — RLS ya le cierra la puerta a esta tabla por completo.
