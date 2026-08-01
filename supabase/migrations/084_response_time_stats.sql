-- 084 — Cuánto tarda cada agente en responder a un lead.
--
-- El reloj arranca cuando entra el lead y para en la PRIMERA acción del agente
-- sobre él. Qué cuenta como acción del agente no se decide aquí: llega en
-- `p_action_types`, resuelto por `src/lib/scoring/agent-actions.ts` contra
-- `lead_score_rules`. Si esta función tuviera su propia lista, volveríamos al
-- problema que la motivó — dos listas de nombres de evento que se separan.
--
-- MEDIANA, no promedio. Los tiempos de respuesta tienen cola larga: un solo
-- lead contestado tres semanas después arrastra la media a un número que no
-- describe ni ese caso ni los demás. La mediana dice "la mitad de los leads se
-- contestaron antes de esto", que es lo que un dueño de agencia quiere saber.
--
-- Los IMPORTADOS quedan fuera: nadie los "respondió" aquí, entraron ya cerrados
-- desde otro CRM. Mismo criterio que el embudo y la conversión.
--
-- Los leads SIN responder todavía se cuentan aparte en vez de asumirles un
-- tiempo. Meterlos como si hubieran tardado "hasta ahora" mezclaría dos cosas
-- distintas: lo que tardas en contestar y lo que llevas sin contestar.
--
-- Y quedan fuera los REGISTRADOS A MANO por el agente. Medido con datos reales:
-- daban una mediana de ~1 minuto, porque el agente da de alta al lead y acto
-- seguido le abre el proceso de compra. No estaba respondiendo rápido — estaba
-- transcribiendo un trato que ya tenía. Un lead que tú mismo escribiste no tiene
-- nada que responder, y contarlo convertiría la métrica en un número de vanidad.
-- El discriminante es el `actor_user_id` del evento de alta: los que entran por
-- formulario no lo llevan.

create or replace function public.lead_response_time_stats(
  p_tenant_id    text default null,
  p_agent_id     text default null,
  p_action_types text[] default array[]::text[],
  p_days         int  default 90
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with scoped as (
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
          and e.type = any (p_action_types)
          and e.created_at > s.created_at
      ) as respondido_en
    from scoped s
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

revoke all on function public.lead_response_time_stats(text, text, text[], int) from public, anon, authenticated;
grant execute on function public.lead_response_time_stats(text, text, text[], int) to service_role;
