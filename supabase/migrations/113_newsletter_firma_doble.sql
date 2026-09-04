-- 113 — Dos firmas por edición: la persona y la agencia, ambas opcionales.
--
-- La 111 dejó UNA firma (`author_name`) que era o el agente o la agencia, y el
-- selector del editor las ofrecía como opciones excluyentes de un mismo
-- desplegable. Eso obliga a una elección que el negocio no quiere hacer: una
-- edición firmada "Adriana Melendez" pierde la marca, y una firmada "A&J Real
-- Estate Group" no posiciona a nadie. El producto existe para posicionar a los
-- AGENTES bajo el paraguas de la agencia — las dos cosas a la vez.
--
-- A partir de aquí son dos columnas independientes:
--
--   author_name      → la persona que firma. NULL = no firma ninguna.
--   author_org_name  → la agencia que firma. NULL = no firma.
--
-- Ambas nullable y sin constraint que obligue a tener al menos una: una
-- edición sin firma es una elección válida del tenant, y un CHECK aquí sólo
-- convertiría esa elección en un error de guardado. La UI ya muestra qué se
-- va a publicar.
--
-- `author_avatar_url` es la tercera pieza: la foto que acompaña a la firma de
-- la persona. Se guarda DESNORMALIZADA por los mismos tres motivos que la 111
-- dio para el nombre (editorial: la edición firmada no se reescribe cuando el
-- agente se va; superficie pública: no hace falta que el sitio del cliente
-- lea `agents`; coste: la portada lista N ediciones sin un join por fila).
--
-- Sale de `agents.cover_photo_url` (migración 095), que es la foto que el
-- propio agente sube en Ajustes → Agentes. Es la única foto de una persona que
-- este esquema tiene: no existe un `agents.avatar_url` aparte, y no se inventa
-- uno aquí — `avatar_initials` + `accent_color` siguen siendo el fallback de
-- avatar dentro del CRM, y cada superficie pública decide el suyo a partir del
-- nombre. Desnormalizar las iniciales y el color sería traer a la web del
-- cliente una paleta pensada para el CRM.

alter table newsletter_editions
  add column if not exists author_org_name   text,
  add column if not exists author_avatar_url text;

comment on column newsletter_editions.author_name is
  'Nombre de la PERSONA que firma, instantánea de agents.name al elegir la firma. NULL = sin firma de persona. Público.';
comment on column newsletter_editions.author_org_name is
  'Nombre de la AGENCIA que firma, instantánea de tenants.name. NULL = la agencia no firma. Público.';
comment on column newsletter_editions.author_avatar_url is
  'Instantánea de agents.cover_photo_url al elegir la firma. NULL si el agente no tiene foto o no firma una persona. Público.';

-- Backfill 1 — separar lo que la 111 aplastó en una sola columna.
--
-- La 111 backfilleó TODA fila sin firma con el nombre del tenant, así que hoy
-- `author_agent_id IS NULL` significa exactamente "esto lo firma la agencia":
-- ese nombre pertenece a `author_org_name`. En un UPDATE las asignaciones se
-- evalúan contra la fila original, así que mover y limpiar en la misma
-- sentencia es correcto.
update newsletter_editions
   set author_org_name = author_name,
       author_name     = null
 where author_agent_id is null
   and author_name is not null;

-- Backfill 2 — la foto de quien ya firmaba.
--
-- Sólo la foto: `author_org_name` NO se rellena para las ediciones que firma
-- una persona. Nadie eligió esa segunda firma, y añadirla en una migración
-- sería cambiar lo que dice un artículo ya publicado.
update newsletter_editions e
   set author_avatar_url = a.cover_photo_url
  from agents a
 where a.id = e.author_agent_id
   and a.cover_photo_url is not null
   and e.author_avatar_url is null;

-- Las dos son públicas: la firma completa se lee desde el sitio del cliente
-- con la anon key. `author_agent_id` sigue siendo interno.
grant select (author_org_name, author_avatar_url) on newsletter_editions to anon;
