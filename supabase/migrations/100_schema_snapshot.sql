-- 100 — Una huella del esquema, para poder compararlo entre proyectos.
--
-- Sandbox y produccion son bases independientes y ya se han separado en
-- silencio: la 065 estaba en una y no en la otra, `lead_magnets` sobrevivio en
-- una, y una migracion aplicada sin dejar archivo en el repo no la ve nadie
-- hasta que algo revienta en local. Este snapshot existe para que un test lo
-- note en cada PR, en vez de que lo note una persona semanas despues.
--
-- Devuelve tres cosas comparables:
--   · migraciones — que se aplico, para cruzarlo con supabase/migrations/
--   · tablas      — huella de (columna, tipo) por tabla, incluidas las vistas
--   · policies    — huella de las RLS por tabla (nombre, comando, condiciones)
--   · funciones   — huella de la definicion de cada funcion propia
--
-- Va por RPC porque el esquema supabase_migrations no esta expuesto en la API.
-- SECURITY DEFINER y solo service_role: lee catalogo, nunca datos de tenant.
--
-- IMPORTANTE: los dos lados de la comparacion tienen que usar ESTA funcion, no
-- una consulta equivalente escrita a mano. `pg_policies.qual` se renderiza segun
-- el search_path de quien pregunta: con `search_path = ''` sale
-- `public.get_my_tenant_id()` y con el search_path normal sale
-- `get_my_tenant_id()`. Comparar una cosa con la otra da 31 tablas "distintas"
-- que en realidad son identicas.
create or replace function public.schema_snapshot()
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'migraciones', coalesce((
      select jsonb_agg(jsonb_build_object('version', m.version, 'name', m.name) order by m.version)
      from supabase_migrations.schema_migrations m
    ), '[]'::jsonb),

    'tablas', coalesce((
      select jsonb_object_agg(t.tabla, t.huella)
      from (
        select c.table_name as tabla,
               md5(string_agg(c.column_name || ':' || c.data_type, ',' order by c.column_name)) as huella
        from information_schema.columns c
        where c.table_schema = 'public'
        group by c.table_name
      ) t
    ), '{}'::jsonb),

    'policies', coalesce((
      select jsonb_object_agg(p.tabla, p.huella)
      from (
        select pol.tablename as tabla,
               md5(string_agg(
                 pol.policyname || ':' || pol.cmd || ':' ||
                 coalesce(pol.qual, '') || ':' || coalesce(pol.with_check, ''),
                 ',' order by pol.policyname
               )) as huella
        from pg_policies pol
        where pol.schemaname = 'public'
        group by pol.tablename
      ) p
    ), '{}'::jsonb),

    'funciones', coalesce((
      select jsonb_object_agg(f.nombre, f.huella)
      from (
        select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as nombre,
               -- Sin comentarios y con los espacios colapsados: la MISMA funcion
               -- puede tener texto distinto en cada proyecto porque en uno se
               -- aplico el archivo del repo y en otro una version resumida por
               -- MCP. Comparar el texto crudo marcaria como distintas 20
               -- funciones que hacen exactamente lo mismo; lo que interesa es
               -- que cambie el CODIGO, no el comentario.
               md5(
                 regexp_replace(
                   regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g'),
                   '\s+', ' ', 'g'
                 )
               ) as huella
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prokind = 'f'
          -- Las funciones que instala una extension no son nuestras.
          and not exists (
            select 1 from pg_depend d
            where d.objid = p.oid and d.deptype = 'e'
          )
      ) f
    ), '{}'::jsonb)
  );
$function$;

revoke all on function public.schema_snapshot() from public, anon, authenticated;
grant execute on function public.schema_snapshot() to service_role;
