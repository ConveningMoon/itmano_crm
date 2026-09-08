-- Migration 113: embeds de terceros en la ficha pública de una propiedad
--
-- Tours 3D (Zillow view-imx, Matterport, iGuide), videos y mapas. Cada elemento
-- es { url, provider, title, placement }:
--
--   placement = 'tour'  → sección "Recorrido virtual", tras "Sobre la propiedad"
--   placement = 'extra' → sección "Video y multimedia", antes de "Planos"
--
-- Se guarda la URL, nunca el HTML del `<iframe>` que pega el agente. Guardar el
-- snippet obligaría a pintarlo con dangerouslySetInnerHTML en una página pública
-- con la marca del cliente, y eso convierte a cualquiera que pueda editar una
-- propiedad en alguien capaz de inyectar <script>. El host se valida contra una
-- lista blanca en src/lib/services/property-embeds.ts y la página construye su
-- propio iframe. La columna es sólo el almacén: no hay CHECK de forma aquí
-- porque la validación real (qué hosts, qué rutas) evoluciona con el código.
--
-- NOT NULL DEFAULT '[]' para que el lector nunca tenga que distinguir "sin
-- embeds" de "todavía no se tocó esta fila".

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS web_embeds jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN properties.web_embeds IS
  'Embeds públicos: [{url, provider, title, placement}]. Sólo URLs validadas contra la lista blanca de property-embeds.ts; nunca HTML.';

-- El sitio externo del cliente lee properties con la anon key y grants por
-- columna (migración 047). Sin esto la columna existiría pero sería invisible
-- ahí, con el mismo síntoma que ya dio una vez: select('*') devuelve 401 y la
-- página no carga. Son URLs públicas de terceros: no hay nada que ocultar.
GRANT SELECT (web_embeds) ON properties TO anon;
