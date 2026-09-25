-- Auditoría de rendimiento, fase 3 (2026-09): `search_path` fijo en las tres
-- funciones que el security advisor marcaba como `function_search_path_mutable`.
--
-- Sin `set search_path`, la función resuelve los nombres que usa con el
-- search_path de QUIEN la llama. Un rol que pueda crear objetos en un esquema
-- anterior en ese path podría interponer los suyos. Las tres son triviales y
-- sólo usan funciones de `pg_catalog` (que siempre se resuelve, también con el
-- path vacío) y columnas de `new`, así que fijar el path no cambia nada de lo
-- que hacen.
--
-- Se recrean con `create or replace`: los triggers que las usan siguen
-- apuntando a la misma función y no hace falta tocarlos.
--
-- Lo que NO se toca, y por qué: el advisor también señala que
-- `get_my_tenant_id()` e `is_super_admin()` son `security definer` ejecutables
-- por `anon` y `authenticated`. Ese permiso es lo que hace funcionar TODA la
-- aislación por tenant: las políticas RLS las llaman y, en Postgres, esas
-- expresiones se evalúan con los privilegios del rol que consulta, no con los
-- del dueño de la política. Se comprobó revocándolo en sandbox: `test:rls`
-- pasó de 110/110 a 63 fallos, con la lectura de cada tabla denegada. Quitar
-- el endpoint `/rpc/` sin perder eso exigiría mover las dos funciones a un
-- esquema no expuesto y recrear todas las políticas que las nombran; lo que
-- filtran hoy es el tenant propio y si uno es super_admin, que es justo lo que
-- el propio usuario ya sabe de sí mismo.

create or replace function public.normalize_agent_languages()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.languages is null or array_length(new.languages, 1) is null then
    new.languages := array[new.language];
  elsif not (new.language = any (new.languages)) then
    new.languages := array[new.language] || new.languages;
  end if;
  return new;
end;
$$;

create or replace function public.touch_newsletter_edition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- `immutable` se conserva: el resultado sólo depende del argumento. `encode` y
-- `translate` viven en pg_catalog, que se resuelve con el search_path vacío.
create or replace function public.agent_api_base64url(p_data bytea)
returns text
language sql
immutable
set search_path = ''
as $$
  -- encode(...,'base64') parte la salida en lineas de 76 caracteres; translate
  -- elimina los saltos y el padding, y cambia el alfabeto a base64url.
  select translate(encode(p_data, 'base64'), E'+/=\n\r', '-_');
$$;
