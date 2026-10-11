-- Los privilegios que tienen anon, authenticated y service_role sobre cada
-- tabla y secuencia de `public`, para que tests/schema/grants.test.ts
-- compruebe que ninguna se quedó sin GRANT explícito.
--
-- Desde el 2026-10-30 Supabase deja de conceder privilegios por defecto a las
-- tablas y secuencias nuevas de `public` (changelog 45329). Una tabla creada sin
-- GRANT no existe para la Data API, ni siquiera para service_role, y el fallo
-- sólo aparece cuando el código la consulta. Las tablas existentes conservan sus
-- grants: el riesgo está en cada migración nueva.
--
-- Va por RPC porque el catálogo no está expuesto en la API. SECURITY DEFINER y
-- sólo service_role, como schema_snapshot(): lee catálogo, nunca datos de tenant.
--
-- Usa has_*_privilege y no el ACL crudo: lo que importa es si el rol puede o no,
-- incluidos los grants heredados de PUBLIC.
create or replace function public.table_grants_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with objetos as (
    select c.oid,
           c.relname,
           c.relkind,
           c.relrowsecurity,
           -- Tabla dueña de una secuencia: 'a' = serial / OWNED BY, 'i' = identity.
           (select t.relname
              from pg_catalog.pg_depend d
              join pg_catalog.pg_class t on t.oid = d.refobjid
             where d.classid = 'pg_catalog.pg_class'::regclass
               and d.objid = c.oid
               and d.refclassid = 'pg_catalog.pg_class'::regclass
               and d.deptype in ('a', 'i')
             limit 1) as tabla_duena,
           exists (
             select 1 from pg_catalog.pg_depend d
              where d.classid = 'pg_catalog.pg_class'::regclass
                and d.objid = c.oid
                and d.deptype = 'i'
           ) as es_identity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'S')
       and not c.relispartition
       -- Lo que instala una extensión no es nuestro.
       and not exists (
         select 1 from pg_catalog.pg_depend d
          where d.classid = 'pg_catalog.pg_class'::regclass
            and d.objid = c.oid
            and d.deptype = 'e'
       )
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'nombre',      o.relname,
      'tipo',        case when o.relkind = 'S' then 'secuencia' else 'tabla' end,
      'rls',         o.relrowsecurity,
      'tabla_duena', o.tabla_duena,
      'es_identity', o.es_identity,
      'privilegios', (
        select jsonb_object_agg(r.rol, coalesce((
          select jsonb_agg(p.priv order by p.priv)
            from unnest(
                   case when o.relkind = 'S'
                        then array['USAGE', 'SELECT', 'UPDATE']
                        else array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
                   end
                 ) as p(priv)
           where case when o.relkind = 'S'
                      then pg_catalog.has_sequence_privilege(r.rol, o.oid, p.priv)
                      else pg_catalog.has_table_privilege(r.rol, o.oid, p.priv)
                 end
        ), '[]'::jsonb))
          from unnest(array['anon', 'authenticated', 'service_role']) as r(rol)
      )
    )
    order by o.relkind, o.relname
  ), '[]'::jsonb)
  from objetos o;
$function$;

revoke all on function public.table_grants_snapshot() from public, anon, authenticated;
grant execute on function public.table_grants_snapshot() to service_role;
