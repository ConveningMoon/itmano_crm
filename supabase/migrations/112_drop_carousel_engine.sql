-- 112 — Se retira el motor de carruseles por completo.
--
-- Lo introdujeron la 066 (tablas + bucket), la 067 (style_prompt), la 068
-- (ledger de logs) y la 071 (pillar). Se probo en produccion y no resulto util:
-- lo que el Estudio ya genera cubre la necesidad, asi que el motor sale del
-- producto en vez de quedarse como codigo muerto detras de un tab.
--
-- Nada mas en el esquema depende de estas tablas: no hay funciones, vistas ni
-- claves foraneas entrantes. Se comprobo contra la base antes de escribir esto,
-- no se asumio.
--
-- EL BUCKET NO SE BORRA AQUI. La 066 lo creo con un `insert into
-- storage.buckets`, pero el camino de vuelta no es simetrico: Supabase protege
-- storage.objects y storage.buckets con un trigger (storage.protect_delete) que
-- aborta cualquier delete por SQL —"Use the Storage API instead"— para no dejar
-- archivos huerfanos en S3. Asi que `carousel-assets` y sus objetos se retiran
-- por la API de Storage con la service_role, como paso aparte de esta migracion.

drop table if exists public.carousel_logs;
drop table if exists public.carousel_slides;
drop table if exists public.carousel_jobs;
drop table if exists public.carousel_brand_profiles;

-- El ledger de IA: las filas de 'carousel_copy' se van con la feature. Son gasto
-- real ya facturado a ITMANO, asi que borrarlas baja el historico de consumo en
-- ese importe — decision explicita, no un efecto colateral. La columna `feature`
-- es texto libre (sin check constraint), asi que no hay nada mas que ajustar.
delete from ai_usage_events where feature = 'carousel_copy';
