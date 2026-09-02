-- 112 — Se retira el motor de carruseles por completo.
--
-- Lo introdujeron la 066 (tablas + bucket), la 067 (style_prompt), la 068
-- (ledger de logs) y la 071 (pillar). Se probo en produccion y no resulto util:
-- lo que el Estudio ya genera cubre la necesidad, asi que el motor sale del
-- producto en vez de quedarse como codigo muerto detras de un tab.
--
-- Nada mas en el esquema depende de estas tablas: no habia funciones, vistas ni
-- claves foraneas entrantes. Se comprobo contra las dos bases antes de escribir
-- esto, no se asumio.
--
-- Los binarios del bucket se borran ANTES por la API de Storage (borrar filas de
-- storage.objects a mano deja los archivos huerfanos en S3). El delete de abajo
-- es la red: si quedara alguno, la FK impediria borrar el bucket y esta
-- migracion fallaria en vez de dejar basura invisible.

drop table if exists public.carousel_logs;
drop table if exists public.carousel_slides;
drop table if exists public.carousel_jobs;
drop table if exists public.carousel_brand_profiles;

delete from storage.objects where bucket_id = 'carousel-assets';
delete from storage.buckets where id = 'carousel-assets';

-- El ledger de IA: las filas de 'carousel_copy' se van con la feature. Son gasto
-- real ya facturado a ITMANO, asi que borrarlas baja el historico de consumo en
-- ese importe — decision explicita, no un efecto colateral. La columna `feature`
-- es texto libre (sin check constraint), asi que no hay nada mas que ajustar.
delete from ai_usage_events where feature = 'carousel_copy';
