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
--     "Cartera activa" diría 460. El dashboard es el libro de trabajo del
--     agente: un lector al que nadie va a llamar no pertenece a ese conteo, y
--     "Calidad alta" y el embudo arrastran el mismo error.
--
--   * lead_analytics_stats — peor, porque el sesgo tiene DIRECCIÓN:
--     `attributed_total` cuenta a los suscriptores y `attributed_closed` no
--     (ningún lector cierra siendo lector; en cuanto muestra intención se
--     gradúa y pierde la marca). Así que la tasa de conversión del tenant se
--     diluye con cada lector captado — justo el número que la newsletter
--     debería ayudar a mejorar.
--
-- Dónde NO se toca, a propósito (spec §3.5): `by_source` sigue contando a los
-- suscriptores. Ahí es donde aportan, porque mide de dónde vino la gente, y la
-- newsletter es una fuente de adquisición real. Por lo mismo se conservan en
-- `total`, `closed`, `active`, `monthly` y `quality_distribution` de
-- /analytics: son "leads captados", que es lo que un suscriptor sí es. Lo que
-- se corrige es la CONVERSIÓN, que compara captación con cierres.
--
-- Sobre el filtro: la condición del spec es
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

-- ── 1) Dashboard: el libro de trabajo del agente no incluye lectores ─────────
-- El filtro va en `scoped`, no en cada contador: esta función no publica ningún
-- agregado por fuente, así que todo lo que devuelve es cartera comercial. Y con
-- el corte en un solo sitio no puede ocurrir que `active` los excluya y el
-- embudo los siga contando.
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
           coalesce(l.quality_score, 0) as quality
    from public.leads_list l
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
      -- 107: un suscriptor de newsletter es un LECTOR, no un prospecto.
      and not l.is_subscriber
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
    'active',       (select count(*)::int from scoped where stage in ('nuevo','nutricion')),
    'high_quality', (select count(*)::int from scoped where stage in ('nuevo','nutricion') and quality_band = 'alta'),
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

-- ── 2) Analytics: la conversión deja de diluirse con cada lector ─────────────
-- Aquí el filtro NO va en `scoped`: `by_source` tiene que seguir viendo a los
-- suscriptores. Se acota sólo el par attributed_total / attributed_closed, que
-- es el que tenía el sesgo con dirección.
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
    'active', (select count(*)::int from scoped where stage in ('nuevo','nutricion')),
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
