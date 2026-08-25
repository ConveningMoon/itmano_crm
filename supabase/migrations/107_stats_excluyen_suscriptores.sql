-- 107 — Los suscriptores de newsletter no falsean el dashboard ni la conversión.
--
-- La 106 sacó al suscriptor del cálculo de quintiles, pero los dos agregados
-- que alimentan /dashboard y /analytics lo siguen contando como si fuera un
-- prospecto. Es el mismo problema que la 080 y la 081 resolvieron con los leads
-- importados, y por el mismo motivo: lo que falta no es una etapa nueva, es la
-- PROCEDENCIA.
--
-- Qué se rompe hoy, en concreto:
--
--   * lead_dashboard_stats — con 60 leads reales y 400 lectores, la tarjeta
--     "Cartera activa" diría 460, y "Calidad alta" cuenta lectores que nadie va
--     a llamar. Esas dos cifras son trabajo pendiente, no inventario.
--
--   * lead_analytics_stats — peor, porque el sesgo tiene DIRECCIÓN:
--     `attributed_total` cuenta a los suscriptores y `attributed_closed` no
--     (ningún lector cierra siendo lector; en cuanto muestra intención se
--     gradúa y pierde la marca). Así que la tasa de conversión del tenant se
--     diluye con cada lector captado — justo el número que la newsletter
--     debería ayudar a mejorar.
--
-- EL CRITERIO, y es el mismo en las DOS funciones:
--
--   INVENTARIO  -> NO excluye lectores.
--   total, by_stage, by_agent, by_source, quality_distribution, this_month
--   Son "cuántos hay". Tienen que cuadrar con lo que el agente ve al abrir
--   /leads, que SÍ lista a los suscriptores y no filtra `is_subscriber` en
--   ningún sitio. Un número de tarjeta que no cuadra con la lista es el bug que
--   este repo ya documenta como causa raíz ("la tarjeta decía 5 y la lista
--   mostraba 2"): el embudo del dashboard promete literalmente "el mismo número
--   que el kanban, comprobable abriendo la lista".
--
--   TRABAJO     -> SÍ excluye lectores.
--   active, high_quality
--   Son "qué tengo pendiente". Un lector no es trabajo de nadie. Se calculan
--   IGUAL en las dos funciones: /dashboard y /analytics rotulan esa cifra
--   "Cartera activa" con el mismo subtítulo, así que tienen que coincidir.
--
--   CONVERSIÓN  -> SÍ excluye lectores.
--   attributed_total, attributed_closed
--   Es la única pareja con sesgo DIRECCIONAL: el denominador los contaba y el
--   numerador no (ningún lector cierra siendo lector; al mostrar intención se
--   gradúa y pierde la marca), así que la tasa del tenant se diluía con cada
--   suscriptor captado.
--
-- `by_source` los conserva por partida doble: es inventario y además el spec
-- §3.5 es explícito en que el suscriptor sí cuenta en la analítica por fuente
-- — ahí es donde aporta, porque mide de dónde vino la gente.
--
-- El filtro del spec es
--   not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber')
-- y es exactamente lo que `leads_list.is_subscriber` ya deriva desde la 106.
-- Las dos funciones leen de esa vista, así que se usa la columna en vez de
-- repetir la expresión: duplicarla abriría la puerta a que un día digan cosas
-- distintas, que es el fallo silencioso que este repo ya ha pagado.
--
-- OJO: las dos funciones se recrean ENTERAS a partir de su definición VIVA
-- (pg_get_functiondef contra el sandbox), no del archivo de la 082 — que ya no
-- coincide con lo aplicado. Perder una clave del jsonb aquí deja una tarjeta en
-- cero sin ningún error.

-- ── 1) Dashboard ────────────────────────────────────────────────────────────
-- Sólo cambian 'active' y 'high_quality'. El resto (total, by_stage, by_agent,
-- urgent_today, imported, closed_this_month) sigue contando a todo el mundo,
-- para no separarse del kanban de /leads.
create or replace function public.lead_dashboard_stats(
  p_tenant_id text default null,
  p_agent_id  text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with scoped as (
    select l.id, l.agent_id, l.stage, l.quality_band, l.urgency, l.is_imported,
           l.is_subscriber,
           coalesce(l.quality_score, 0) as quality
    from public.leads_list l
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
  ),
  -- Sólo los leads que SÍ recorrieron el embudo dentro del CRM.
  by_stage as (select stage, count(*)::int as c from scoped where not is_imported group by stage),
  by_agent as (
    select agent_id,
           count(*)::int                                              as total,
           (count(*) filter (where quality_band = 'alta'))::int        as high_quality,
           (count(*) filter (where stage = 'cerrado'))::int            as closed
    from scoped
    group by agent_id
  )
  select jsonb_build_object(
    'total',        (select count(*)::int from scoped),
    -- 107: la cartera de TRABAJO excluye a los lectores; el INVENTARIO no.
    -- Ver la nota de arriba: 'total', 'by_stage' y 'by_agent' tienen que cuadrar
    -- con lo que el agente ve al abrir /leads, que sí los lista.
    'active',       (select count(*)::int from scoped where stage in ('nuevo','nutricion') and not is_subscriber),
    'high_quality', (select count(*)::int from scoped where stage in ('nuevo','nutricion') and quality_band = 'alta' and not is_subscriber),
    'urgent_today', (select count(*)::int from scoped where urgency = 'hoy'),
    'imported',     (select count(*)::int from scoped where is_imported),
    -- Cuándo se CERRÓ, no cuándo entró. Las filas anteriores a la 082 guardan
    -- el vocabulario viejo, así que se aceptan los dos.
    'closed_this_month', (
      select count(distinct h.lead_id)::int
      from public.lead_status_history h
      where h.lead_id in (select id from scoped)
        and h.to_status in ('cerrado', 'closed', 'process_completed')
        and h.changed_at >= date_trunc('month', (now() at time zone 'utc')) at time zone 'utc'
    ),
    'by_stage', coalesce((select jsonb_object_agg(stage, c) from by_stage), '{}'::jsonb),
    'by_agent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent_id', agent_id, 'total', total,
        'high_quality', high_quality, 'closed', closed
      ))
      from by_agent
    ), '[]'::jsonb)
  );
$function$;

-- ── 2) Analytics ────────────────────────────────────────────────────────────
-- 'active' se alinea con el dashboard y la conversión se acota. by_source,
-- total, closed, by_stage, by_agent, monthly, quality_distribution y this_month
-- los conservan: son inventario.
create or replace function public.lead_analytics_stats(
  p_tenant_id text default null,
  p_agent_id  text default null,
  p_months    int  default 7
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with bounds as (
    select
      date_trunc('month', (now() at time zone 'utc')) as month_start,
      date_trunc('month', (now() at time zone 'utc'))
        - make_interval(months => greatest(coalesce(p_months, 7), 1) - 1) as window_start
  ),
  scoped as (
    select
      l.agent_id, l.stage, l.quality_band, l.is_imported, l.is_subscriber,
      coalesce(l.quality_score, 0) as quality,
      l.traffic_source,
      c.channel_type,
      date_trunc('month', (l.created_at at time zone 'utc')) as created_month
    from public.leads_list l
    left join public.acquisition_channels c on c.id = l.acquisition_channel_id
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
  ),
  by_source as (
    select channel_type, traffic_source,
           count(*)::int            as total,
           round(avg(quality))::int as avg_quality
    from scoped
    group by channel_type, traffic_source
  ),
  by_agent as (
    select
      agent_id,
      count(*)::int                                          as total,
      (count(*) filter (where quality_band = 'alta'))::int    as high_quality,
      (count(*) filter (where stage = 'cerrado'))::int        as closed,
      round(avg(quality))::int                               as avg_quality
    from scoped
    group by agent_id
  ),
  agent_stages as (
    select agent_id, jsonb_object_agg(stage, c) as stages
    from (select agent_id, stage, count(*)::int as c from scoped group by agent_id, stage) s
    group by agent_id
  ),
  monthly as (
    select
      to_char(s.created_month, 'YYYY-MM')                          as month,
      count(*)::int                                                as leads,
      (count(*) filter (where s.stage = 'nuevo'))::int             as nuevo,
      (count(*) filter (where s.stage = 'nutricion'))::int         as nutricion,
      (count(*) filter (where s.stage = 'en_proceso'))::int        as en_proceso,
      (count(*) filter (where s.stage = 'cerrado'))::int           as cerrado,
      (count(*) filter (where s.stage = 'perdido'))::int           as perdido
    from scoped s, bounds b
    where s.created_month >= b.window_start
    group by s.created_month
  ),
  by_quality as (select quality_band, count(*)::int as c from scoped group by quality_band),
  by_stage   as (select stage, count(*)::int as c from scoped group by stage)
  select jsonb_build_object(
    'total',  (select count(*)::int from scoped),
    'closed', (select count(*)::int from scoped where stage = 'cerrado'),
    -- 107: MISMO cálculo que lead_dashboard_stats. Las dos pantallas rotulan
    -- esta cifra "Cartera activa / Cartera Activa" con el mismo subtítulo
    -- ("nuevos y en nutrición"): si una excluyera lectores y la otra no,
    -- dirían números distintos bajo la misma etiqueta.
    'active', (select count(*)::int from scoped where stage in ('nuevo','nutricion') and not is_subscriber),
    -- Denominador y numerador de la CONVERSIÓN: sólo lo captado por ITMANO.
    -- 107: y sólo prospectos. Un suscriptor inflaba el denominador y nunca el
    -- numerador (al mostrar intención se gradúa y pierde la marca), así que
    -- cada lector bajaba la tasa sin que hubiera pasado nada malo.
    'attributed_total',  (select count(*)::int from scoped where not is_imported and not is_subscriber),
    'attributed_closed', (select count(*)::int from scoped where not is_imported and not is_subscriber and stage = 'cerrado'),
    'imported', (select count(*)::int from scoped where is_imported),
    'quality_distribution', coalesce((select jsonb_object_agg(quality_band, c) from by_quality where quality_band is not null), '{}'::jsonb),
    'by_stage', coalesce((select jsonb_object_agg(stage, c) from by_stage), '{}'::jsonb),
    'this_month', jsonb_build_object(
      'leads', (select count(*)::int from scoped s, bounds b where s.created_month = b.month_start),
      'high_quality', (select count(*)::int from scoped s, bounds b where s.created_month = b.month_start and s.quality_band = 'alta')
    ),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object(
        'channel_type', channel_type, 'traffic_source', traffic_source,
        'total', total, 'avg_quality', avg_quality
      ))
      from by_source
    ), '[]'::jsonb),
    'by_agent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent_id',  a.agent_id,
        'total',     a.total,
        'high_quality', a.high_quality,
        'closed',    a.closed,
        'avg_quality', a.avg_quality,
        'stages',    coalesce(sg.stages, '{}'::jsonb)
      ))
      from by_agent a
      left join agent_stages sg on sg.agent_id = a.agent_id
    ), '[]'::jsonb),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', month, 'leads', leads,
        'nuevo', nuevo, 'nutricion', nutricion,
        'en_proceso', en_proceso, 'cerrado', cerrado, 'perdido', perdido
      ))
      from monthly
    ), '[]'::jsonb)
  );
$function$;
