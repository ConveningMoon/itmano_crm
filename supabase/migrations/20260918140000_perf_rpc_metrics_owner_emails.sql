-- Auditoría de rendimiento, fase 2 (2026-09): cuatro funciones que quitan olas
-- de round-trips en páginas del CRM. Ninguna cambia lo que ve el usuario; sólo
-- de dónde sale el número.
--
-- 1. sequence_email_metrics: las métricas de envío de las secuencias (totales,
--    click/reply/bounce/unsub rate y el desglose por paso) salían de una cadena
--    de tres consultas en serie (runs → envíos → eventos) que /emails y
--    /emails/[id] pagaban DESPUÉS de tener la lista de secuencias, y
--    /analytics/emails repetía secuencia por secuencia (N+1). Aquí es UNA
--    consulta por tenant, que además puede arrancar en paralelo con todo lo
--    demás porque no necesita la lista de secuencias primero.
--
--    Misma definición que tenía el código: un lead cuenta como "hizo click" si
--    tiene un lead_event de ese tipo con fecha igual o posterior a su PRIMER
--    envío dentro de la secuencia (o del paso, para el desglose por paso). Las
--    tasas son leads distintos con evento / leads distintos con envío, en
--    porcentaje entero redondeado. Una secuencia sin envíos sale en cero: la
--    fila de la lista tiene que distinguir "todavía no envió" de "no existe".
--
-- 2. tenant_channel_metrics: channel_metrics (075) recibe ids de canales, así
--    que /sources y /analytics tenían que leer los canales primero y pedir las
--    métricas después. Con el tenant como entrada, las dos lecturas viajan
--    juntas. Es un envoltorio: la agregación sigue siendo la de 075/097.
--
-- 3. tenant_owner_emails: el centro de control resolvía el email del owner de
--    cada tenant con una llamada al Auth Admin API POR TENANT, en serie. Esto
--    devuelve todos en una consulta. Es security definer porque lee auth.users;
--    por eso sólo puede ejecutarla service_role (el cliente admin del
--    servidor), nunca anon ni authenticated.
--
-- 4. lead_response_time_stats: recibía la lista de tipos de acción ya resuelta,
--    y resolverla era una consulta previa a lead_score_rules que serializaba la
--    RPC detrás de ella en /analytics. Con p_include_manual_rules la función
--    une ella misma las reglas manuales activas del tenant a los tipos fijos
--    que le pasa el código (que siguen viviendo en un solo sitio:
--    src/lib/scoring/agent-actions.ts). La firma cambia, así que se recrea.

-- ── 1. Métricas de envío por secuencia ───────────────────────────────────────

create or replace function public.sequence_email_metrics(
  p_tenant_id    text   default null,
  p_sequence_ids uuid[] default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with seqs as (
    select s.id
    from public.email_sequences s
    where (p_tenant_id    is null or s.tenant_id = p_tenant_id)
      and (p_sequence_ids is null or s.id = any (p_sequence_ids))
  ),
  sends as (
    select r.sequence_id, e.lead_id, e.step_order, e.sent_at
    from public.email_sends e
    join public.lead_sequence_runs r on r.id = e.sequence_run_id
    where r.sequence_id in (select id from seqs)
  ),
  ev as (
    select x.lead_id, x.type, x.created_at
    from public.lead_events x
    where x.type in ('email_clicked', 'email_replied', 'email_hard_bounce', 'email_unsubscribed')
      and x.lead_id in (select distinct lead_id from sends)
  ),
  -- Por secuencia: primer envío de cada lead y qué eventos tuvo después.
  seq_lead as (
    select f.sequence_id, f.lead_id,
      bool_or(e.type = 'email_clicked')      as clicked,
      bool_or(e.type = 'email_replied')      as replied,
      bool_or(e.type = 'email_hard_bounce')  as bounced,
      bool_or(e.type = 'email_unsubscribed') as unsubscribed
    from (
      select sequence_id, lead_id, min(sent_at) as first_sent
      from sends group by sequence_id, lead_id
    ) f
    left join ev e on e.lead_id = f.lead_id and e.created_at >= f.first_sent
    group by f.sequence_id, f.lead_id
  ),
  seq_agg as (
    select sequence_id,
      count(*)::int                               as unique_leads,
      (count(*) filter (where clicked))::int      as clicked,
      (count(*) filter (where replied))::int      as replied,
      (count(*) filter (where bounced))::int      as bounced,
      (count(*) filter (where unsubscribed))::int as unsubscribed
    from seq_lead group by sequence_id
  ),
  seq_sends as (
    select sequence_id, count(*)::int as total_sends from sends group by sequence_id
  ),
  -- Por paso: mismo criterio, con el primer envío de ESE paso.
  step_lead as (
    select f.sequence_id, f.step_order, f.lead_id,
      bool_or(e.type = 'email_clicked') as clicked,
      bool_or(e.type = 'email_replied') as replied
    from (
      select sequence_id, step_order, lead_id, min(sent_at) as first_sent
      from sends group by sequence_id, step_order, lead_id
    ) f
    left join ev e on e.lead_id = f.lead_id and e.created_at >= f.first_sent
    group by f.sequence_id, f.step_order, f.lead_id
  ),
  step_agg as (
    select sequence_id, step_order,
      count(*)::int                          as unique_leads,
      (count(*) filter (where clicked))::int as clicked,
      (count(*) filter (where replied))::int as replied
    from step_lead group by sequence_id, step_order
  ),
  step_sends as (
    select sequence_id, step_order, count(*)::int as total_sends
    from sends group by sequence_id, step_order
  ),
  steps_json as (
    select ss.sequence_id,
      jsonb_agg(jsonb_build_object(
        'step_order',  ss.step_order,
        'total_sends', ss.total_sends,
        'click_rate',  case when sa.unique_leads > 0 then round(sa.clicked::numeric / sa.unique_leads * 100)::int else 0 end,
        'reply_rate',  case when sa.unique_leads > 0 then round(sa.replied::numeric / sa.unique_leads * 100)::int else 0 end
      ) order by ss.step_order) as steps
    from step_sends ss
    join step_agg sa on sa.sequence_id = ss.sequence_id and sa.step_order = ss.step_order
    group by ss.sequence_id
  ),
  -- Total del conjunto: primer envío de cada lead en CUALQUIER secuencia.
  all_lead as (
    select f.lead_id,
      bool_or(e.type = 'email_clicked')      as clicked,
      bool_or(e.type = 'email_replied')      as replied,
      bool_or(e.type = 'email_hard_bounce')  as bounced,
      bool_or(e.type = 'email_unsubscribed') as unsubscribed
    from (select lead_id, min(sent_at) as first_sent from sends group by lead_id) f
    left join ev e on e.lead_id = f.lead_id and e.created_at >= f.first_sent
    group by f.lead_id
  ),
  all_agg as (
    select
      count(*)::int                               as unique_leads,
      (count(*) filter (where clicked))::int      as clicked,
      (count(*) filter (where replied))::int      as replied,
      (count(*) filter (where bounced))::int      as bounced,
      (count(*) filter (where unsubscribed))::int as unsubscribed
    from all_lead
  )
  select jsonb_build_object(
    'sequences', coalesce((
      select jsonb_object_agg(s.id, jsonb_build_object(
        'total_sends',      coalesce(ss.total_sends, 0),
        'unique_leads',     coalesce(sa.unique_leads, 0),
        'click_rate',       case when coalesce(sa.unique_leads, 0) > 0 then round(sa.clicked::numeric      / sa.unique_leads * 100)::int else 0 end,
        'reply_rate',       case when coalesce(sa.unique_leads, 0) > 0 then round(sa.replied::numeric      / sa.unique_leads * 100)::int else 0 end,
        'bounce_rate',      case when coalesce(sa.unique_leads, 0) > 0 then round(sa.bounced::numeric      / sa.unique_leads * 100)::int else 0 end,
        'unsubscribe_rate', case when coalesce(sa.unique_leads, 0) > 0 then round(sa.unsubscribed::numeric / sa.unique_leads * 100)::int else 0 end,
        'steps',            coalesce(sj.steps, '[]'::jsonb)
      ))
      from seqs s
      left join seq_sends  ss on ss.sequence_id = s.id
      left join seq_agg    sa on sa.sequence_id = s.id
      left join steps_json sj on sj.sequence_id = s.id
    ), '{}'::jsonb),
    'total', (
      select jsonb_build_object(
        'total_sends',      (select count(*)::int from sends),
        'unique_leads',     coalesce(a.unique_leads, 0),
        'click_rate',       case when coalesce(a.unique_leads, 0) > 0 then round(a.clicked::numeric      / a.unique_leads * 100)::int else 0 end,
        'reply_rate',       case when coalesce(a.unique_leads, 0) > 0 then round(a.replied::numeric      / a.unique_leads * 100)::int else 0 end,
        'bounce_rate',      case when coalesce(a.unique_leads, 0) > 0 then round(a.bounced::numeric      / a.unique_leads * 100)::int else 0 end,
        'unsubscribe_rate', case when coalesce(a.unique_leads, 0) > 0 then round(a.unsubscribed::numeric / a.unique_leads * 100)::int else 0 end
      )
      from all_agg a
    )
  );
$$;

revoke all on function public.sequence_email_metrics(text, uuid[]) from public, anon, authenticated;
grant execute on function public.sequence_email_metrics(text, uuid[]) to service_role;

-- ── 2. Métricas de canal por tenant ──────────────────────────────────────────

create or replace function public.tenant_channel_metrics(
  p_tenant_id   text,
  p_window_days integer default 30
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.channel_metrics(
    coalesce(array(select c.id from public.acquisition_channels c where c.tenant_id = p_tenant_id), '{}'::uuid[]),
    p_window_days
  );
$$;

revoke all on function public.tenant_channel_metrics(text, integer) from public, anon, authenticated;
grant execute on function public.tenant_channel_metrics(text, integer) to service_role;

-- ── 3. Email del owner de cada tenant ────────────────────────────────────────

create or replace function public.tenant_owner_emails()
returns table (tenant_id text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select up.tenant_id, u.email::text
  from public.user_profiles up
  join auth.users u on u.id = up.id
  where up.role = 'agent_owner'
    and up.tenant_id is not null;
$$;

revoke all on function public.tenant_owner_emails() from public, anon, authenticated;
grant execute on function public.tenant_owner_emails() to service_role;

-- ── 4. Tiempo de respuesta: resuelve las reglas manuales por dentro ──────────

drop function if exists public.lead_response_time_stats(text, text, text[], integer);

create or replace function public.lead_response_time_stats(
  p_tenant_id            text    default null,
  p_agent_id             text    default null,
  p_action_types         text[]  default array[]::text[],
  p_days                 integer default 90,
  p_include_manual_rules boolean default false
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with tipos as (
    -- Los tipos fijos vienen del código; las reglas manuales activas del tenant
    -- (globales + override) se unen aquí para no pagar una consulta previa.
    select array(
      select unnest(coalesce(p_action_types, array[]::text[]))
      union
      select r.dimension
      from public.lead_score_rules r
      where p_include_manual_rules
        and r.category = 'manual'
        and r.is_active
        and (p_tenant_id is null or r.tenant_id is null or r.tenant_id = p_tenant_id)
    ) as arr
  ),
  scoped as (
    select l.id, l.agent_id, l.created_at
    from public.leads l
    where (p_tenant_id is null or l.tenant_id = p_tenant_id)
      and (p_agent_id  is null or l.agent_id  = p_agent_id)
      and not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'imported')
      and not exists (
        select 1 from public.lead_events e
        where e.lead_id = l.id and e.type = 'lead_created' and e.actor_user_id is not null
      )
      and l.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 90), 1))
  ),
  -- Primera acción del agente POSTERIOR al alta del lead. El `> s.created_at`
  -- importa: el evento `lead_created` de un alta manual comparte instante con el
  -- lead y daría un tiempo de respuesta de cero para todos los registros a mano.
  primera as (
    select
      s.id,
      s.agent_id,
      s.created_at,
      (
        select min(e.created_at)
        from public.lead_events e
        where e.lead_id = s.id
          and e.type = any (t.arr)
          and e.created_at > s.created_at
      ) as respondido_en
    from scoped s
    cross join tipos t
  ),
  medidos as (
    select agent_id,
           extract(epoch from (respondido_en - created_at)) / 3600.0 as horas
    from primera
    where respondido_en is not null
  ),
  por_agente as (
    select
      p.agent_id,
      count(*)::int                                              as total,
      (count(*) filter (where p.respondido_en is not null))::int as respondidos,
      (select round(percentile_cont(0.5) within group (order by m.horas)::numeric, 1)
       from medidos m where m.agent_id = p.agent_id)             as mediana_horas
    from primera p
    group by p.agent_id
  )
  select jsonb_build_object(
    'total',       (select count(*)::int from primera),
    'respondidos', (select count(*)::int from primera where respondido_en is not null),
    'sin_responder', (select count(*)::int from primera where respondido_en is null),
    'mediana_horas', (
      select round(percentile_cont(0.5) within group (order by horas)::numeric, 1) from medidos
    ),
    'by_agent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent_id',      agent_id,
        'total',         total,
        'respondidos',   respondidos,
        'mediana_horas', mediana_horas
      ))
      from por_agente
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.lead_response_time_stats(text, text, text[], integer, boolean) from public, anon, authenticated;
grant execute on function public.lead_response_time_stats(text, text, text[], integer, boolean) to service_role;
