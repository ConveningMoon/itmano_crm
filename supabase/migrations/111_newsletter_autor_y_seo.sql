-- 111 — Autoría de las ediciones y configuración del canonical.
--
-- Las newsletters existen para posicionar a los AGENTES, y un artículo sin
-- firma no construye E-E-A-T. `created_by_agent_id` ya existía pero responde
-- otra pregunta ("quién pulsó crear"), no es público, y con la IA de por medio
-- deja de coincidir con quién firma.
--
-- La firma se guarda DESNORMALIZADA a propósito (author_name / author_title):
--   1. Editorial: si el agente deja la agencia, la edición que firmó sigue
--      firmada por él. Reescribir la autoría de un artículo publicado es
--      falsificar el archivo.
--   2. Superficie pública: la alternativa es concederle a `anon` un select
--      sobre `agents` entera para leer un nombre.
--   3. Coste: la portada lista N ediciones sin un join por fila.
-- `author_agent_id` se guarda además, como vínculo interno para saber de qué
-- agente es el SEO que se está construyendo. NO es público.

alter table newsletter_editions
  add column if not exists author_agent_id text references agents(id) on delete set null,
  add column if not exists author_name     text,
  add column if not exists author_title    text;

comment on column newsletter_editions.author_agent_id is
  'Agente que firma. Vínculo interno, no público. ON DELETE SET NULL: al borrar el agente se pierde el vínculo, nunca la firma.';
comment on column newsletter_editions.author_name is
  'Instantánea de agents.name al publicar. Público.';
comment on column newsletter_editions.author_title is
  'Cargo que el propio agente escriba de sí mismo. NO sale de agents.specialty (segmento de audiencia, no cargo): hoy se escribe NULL explícito. Reservada para cuando exista ese campo. Público.';

-- Config del canonical (ver D1/D2 del spec). La plantilla lleva {slug} porque
-- no sabemos qué ruta usa la web del cliente; adivinar produce canonicals a
-- 404, que es peor que no ponerlos.
alter table tenants
  add column if not exists public_site_url               text,
  add column if not exists newsletter_canonical_template text;

comment on column tenants.newsletter_canonical_template is
  'Plantilla de URL de la edición en la web del cliente, con {slug}. Ej: https://ajrealestate.com/newsletter/{slug}. Null = el canonical apunta a news.itmano.com.';

-- Backfill: TODAS las filas existentes, borradores incluidos, firman con el
-- nombre de la agencia. No se les inventa un agente.
update newsletter_editions e
   set author_name = t.name
  from tenants t
 where t.id = e.tenant_id
   and e.author_name is null;

-- Sólo la firma es pública. author_agent_id, public_site_url y
-- newsletter_canonical_template los lee el servidor.
grant select (author_name, author_title) on newsletter_editions to anon;
