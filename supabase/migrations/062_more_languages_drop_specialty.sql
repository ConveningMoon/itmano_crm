-- 062 · Más idiomas por agente/lead + retiro de "especialidad".
--
-- (1) Idiomas: la especialidad del agente ya no existe y el idioma se amplía a
--     un set grande (relevante para EE.UU. + España). Se relajan todos los
--     CHECK de idioma para aceptar el nuevo set (fuente única en el código:
--     SUPPORTED_LANGUAGE_CODES en src/lib/config.ts — este SQL lo refleja).
-- (2) specialty: se retira del producto (no aportaba y NO decidía el ruteo,
--     que va por dueño del canal). Aquí solo se hace NULLABLE para no romper el
--     código ya desplegado que aún la SELECT; el DROP de la columna va en una
--     migración posterior, una vez desplegado el código que deja de usarla.

-- ── Set de idiomas soportados ─────────────────────────────────────────────────
-- es en pt fr de it zh ja ko ru ar hi vi tl ht pl uk tr nl
-- (español, inglés, portugués, francés, alemán, italiano, chino, japonés,
--  coreano, ruso, árabe, hindi, vietnamita, tagalo, criollo haitiano, polaco,
--  ucraniano, turco, neerlandés)

-- leads.language
alter table leads drop constraint if exists leads_language_check;
alter table leads add constraint leads_language_check check (
  language in ('es','en','pt','fr','de','it','zh','ja','ko','ru','ar','hi','vi','tl','ht','pl','uk','tr','nl')
);

-- agents.language (idioma principal)
alter table agents drop constraint if exists agents_language_check;
alter table agents add constraint agents_language_check check (
  language in ('es','en','pt','fr','de','it','zh','ja','ko','ru','ar','hi','vi','tl','ht','pl','uk','tr','nl')
);

-- agents.languages (set registrado; conserva las reglas de 058)
alter table agents drop constraint if exists agents_languages_check;
alter table agents add constraint agents_languages_check check (
  languages <@ array['es','en','pt','fr','de','it','zh','ja','ko','ru','ar','hi','vi','tl','ht','pl','uk','tr','nl']
  and array_length(languages, 1) >= 1
  and language = any (languages)
);

-- purchase_email_templates.language
alter table purchase_email_templates drop constraint if exists purchase_email_templates_language_check;
alter table purchase_email_templates add constraint purchase_email_templates_language_check check (
  language in ('es','en','pt','fr','de','it','zh','ja','ko','ru','ar','hi','vi','tl','ht','pl','uk','tr','nl')
);

-- ── specialty: nullable (retiro suave, sin romper el código desplegado) ────────
alter table agents alter column specialty drop not null;
