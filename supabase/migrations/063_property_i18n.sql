-- 063 · Descripciones y características de propiedad en varios idiomas (máx 3).
--
-- Antes: columnas fijas description_es/en, features_es/en. Ahora el tenant elige
-- hasta 3 idiomas y llena descripción + características por idioma. Fuente de
-- verdad: descriptions {lang: text} y features_i18n {lang: text[]}. Se mantienen
-- description_es/en y features_es/en SINCRONIZADAS desde el JSONB (compat con la
-- web externa de A&J que lee esas columnas por anon).

alter table properties
  add column if not exists descriptions      jsonb   not null default '{}'::jsonb,
  add column if not exists features_i18n      jsonb   not null default '{}'::jsonb,
  add column if not exists content_languages  text[]  not null default array[]::text[];

-- Migrar es/en existentes al JSONB.
update properties set descriptions =
  (case when coalesce(trim(description_es), '') <> '' then jsonb_build_object('es', description_es) else '{}'::jsonb end)
  || (case when coalesce(trim(description_en), '') <> '' then jsonb_build_object('en', description_en) else '{}'::jsonb end)
where descriptions = '{}'::jsonb;

update properties set features_i18n =
  (case when coalesce(array_length(features_es, 1), 0) > 0 then jsonb_build_object('es', to_jsonb(features_es)) else '{}'::jsonb end)
  || (case when coalesce(array_length(features_en, 1), 0) > 0 then jsonb_build_object('en', to_jsonb(features_en)) else '{}'::jsonb end)
where features_i18n = '{}'::jsonb;

-- content_languages = unión de los idiomas presentes en descripciones/features.
update properties set content_languages = (
  select coalesce(array_agg(distinct k), array[]::text[])
  from (
    select jsonb_object_keys(descriptions) as k
    union
    select jsonb_object_keys(features_i18n) as k
  ) t
)
where content_languages = array[]::text[];
