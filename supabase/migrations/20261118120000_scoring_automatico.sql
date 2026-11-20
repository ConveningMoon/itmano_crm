-- Scoring automático: salud del modelo, bandas que se dan cuenta de que no
-- distinguen, calibración registrada y cambios de modelo que rigen al instante.
--
-- 1) tenant_quality_bands.degenerate + refresh_quality_bands
-- 2) leads_list: con bandas degeneradas se usan los cortes fijos
-- 3) recompute_lead_score: sin aviso de "lead caliente" en recálculos masivos
-- 4) recompute_scores_bulk
-- 5) Regla global open_house_attended
-- 6) scoring_calibrations (registro de calibraciones)
-- 7) scoring_quality_preview + preview_score_rule_changes
-- 8) scoring_health + scoring_rule_usage

-- ── 1) Bandas degeneradas ────────────────────────────────────────────────────
--
-- Los quintiles reparten la cartera activa en cinco bandas iguales. Si casi
-- todos los leads tienen el mismo quality_score (un tenant cuyos leads no
-- declaran perfil y sólo suman "formulario enviado"), los cortes colapsan: en
-- noviembre de 2026 un tenant real tenía p20 = p40 = p60 = 30 y p80 = 32, y su
-- "calidad alta" eran los leads con 2 puntos más que el resto.
--
-- Se considera degenerado cuando dos cortes consecutivos coinciden (una banda
-- queda vacía) o cuando entre p20 y p80 hay menos de 10 puntos: menos que dos
-- señales pequeñas, así que la banda no dice nada del lead. En ese caso la vista
-- usa los cortes fijos (los mismos que con menos de 20 leads activos), que al
-- menos miden algo absoluto, y el Centro de control lo avisa.

alter table public.tenant_quality_bands
  add column if not exists degenerate boolean not null default false;

comment on column public.tenant_quality_bands.degenerate is
  'true si los quintiles no distinguen (cortes repetidos o p80 - p20 < 10): leads_list usa los cortes fijos.';

create or replace function public.refresh_quality_bands()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer := 0;
begin
  insert into tenant_quality_bands (tenant_id, p20, p40, p60, p80, active_leads, degenerate, computed_at)
  select
    c.tenant_id, c.p20, c.p40, c.p60, c.p80, c.active_leads,
    (c.p20 = c.p40 or c.p40 = c.p60 or c.p60 = c.p80 or c.p80 - c.p20 < 10),
    now()
  from (
    select
      t.tenant_id,
      percentile_cont(0.2) within group (order by t.q)::int as p20,
      percentile_cont(0.4) within group (order by t.q)::int as p40,
      percentile_cont(0.6) within group (order by t.q)::int as p60,
      percentile_cont(0.8) within group (order by t.q)::int as p80,
      count(*)::int as active_leads
    from (
      select l.tenant_id, coalesce(l.quality_score, 0) as q
      from   leads l
      -- Solo cartera VIVA: cerrar un buen lead no debe degradar a los demas.
      where  l.stage not in ('en_proceso','cerrado','perdido')
      -- Y solo PROSPECTOS: un lector de la newsletter no define que es un lead
      -- de banda "alta" para esta agencia.
        and  not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber')
    ) t
    group by t.tenant_id
  ) c
  on conflict (tenant_id) do update
  set p20 = excluded.p20, p40 = excluded.p40, p60 = excluded.p60,
      p80 = excluded.p80, active_leads = excluded.active_leads,
      degenerate = excluded.degenerate,
      computed_at = excluded.computed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- ── 2) leads_list ────────────────────────────────────────────────────────────
--
-- Misma definición viva que la 116; sólo cambia la primera rama de
-- quality_band: `or coalesce(b.degenerate, false)`. create or replace conserva
-- columnas, orden y permisos. Los cortes fijos se repiten en
-- src/lib/scoring/score-bands.ts y en scoring_quality_preview (abajo).

create or replace view public.leads_list
with (security_invoker = on) as
select
  l.id,
  l.tenant_id,
  l.agent_id,
  l.first_name,
  l.last_name,
  l.email,
  l.phone,
  l.language,
  l.lender,
  l.notes,
  l.created_at,
  l.updated_at,
  l.acquisition_channel_id,
  l.traffic_source,
  l.traffic_source_detail,
  l.peak_score,
  l.current_score,
  l.last_event_at,
  l.score_updated_at,
  l.metadata,
  l.fit_profile,
  l.fit_score,
  l.engagement_score,
  l.manual_score,
  l.email_blocked,
  l.email_blocked_reason,
  l.search_text,
  l.quality_score,
  l.last_signal_at,
  l.last_signal_type,
  l.stage,

  -- Procedencia: vino de otro CRM, no lo capto un canal de ITMANO.
  jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'imported') as is_imported,

  -- Procedencia: llego por el formulario de una newsletter y todavia no ha
  -- mostrado intencion. Se le quita la marca al graduarse.
  jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber') as is_subscriber,

  case
    when coalesce(b.active_leads, 0) < 20 or coalesce(b.degenerate, false) then
      case
        when coalesce(l.quality_score, 0) >= 80 then 'alta'
        when coalesce(l.quality_score, 0) >= 60 then 'media_alta'
        when coalesce(l.quality_score, 0) >= 35 then 'media'
        when coalesce(l.quality_score, 0) >= 15 then 'media_baja'
        else 'baja'
      end
    else
      case
        when coalesce(l.quality_score, 0) >= b.p80 then 'alta'
        when coalesce(l.quality_score, 0) >= b.p60 then 'media_alta'
        when coalesce(l.quality_score, 0) >= b.p40 then 'media'
        when coalesce(l.quality_score, 0) >= b.p20 then 'media_baja'
        else 'baja'
      end
  end as quality_band,

  case
    when l.stage not in ('nuevo','nutricion')                        then null
    when ai.fresh_when is not null                                   then ai.fresh_when
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 'hoy'
    when l.last_signal_at > now() - interval '7 days'                then 'esta_semana'
    else 'sin_apuro'
  end as urgency,

  case
    when l.stage not in ('nuevo','nutricion')                        then 9
    when ai.fresh_when = 'hoy'                                       then 0
    when ai.fresh_when = 'esta_semana'                               then 1
    when ai.fresh_when = 'sin_apuro'                                 then 2
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 0
    when l.last_signal_at > now() - interval '7 days'                then 1
    else 2
  end as urgency_rank,

  l.budget_amount,

  -- Etiquetas del lead (116). Vacío y no null cuando no tiene ninguna: así el
  -- filtro por etiqueta y el render de los chips no necesitan tratar el null.
  coalesce((
    select array_agg(a.tag_id order by a.created_at)
    from public.lead_tag_assignments a
    where a.lead_id = l.id
  ), '{}'::uuid[]) as tag_ids
from public.leads l
left join public.tenant_quality_bands b on b.tenant_id = l.tenant_id
left join lateral (
  select case
    when s.at_ts is null                                                  then null
    when s.w = 'hoy'         and s.at_ts > now() - interval '48 hours'    then 'hoy'
    when s.w = 'esta_semana' and s.at_ts > now() - interval '7 days'      then 'esta_semana'
    when s.w = 'sin_apuro'   and s.at_ts > now() - interval '7 days'      then 'sin_apuro'
  end as fresh_when
  from (
    select
      l.metadata #>> '{ai_fit,next_action_when}' as w,
      case when (l.metadata #>> '{ai_fit,at}') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
           then (l.metadata #>> '{ai_fit,at}')::timestamptz end as at_ts
  ) s
) ai on true;

revoke all on public.leads_list from anon;
grant select on public.leads_list to authenticated, service_role;

-- ── 3) recompute_lead_score ──────────────────────────────────────────────────
--
-- Definición de la 082 con un único cambio: el aviso de lead caliente se omite
-- cuando el recálculo es masivo (app.bulk_recompute = 'on', sólo dentro de la
-- transacción de recompute_scores_bulk). Los permisos de la 20261117171000
-- (sólo service_role) se conservan con create or replace.

create or replace function public.recompute_lead_score(p_lead_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead          leads%rowtype;
  v_fit           integer;
  v_eng           integer;
  v_man           integer;
  v_eng_raw       integer;
  v_quality       integer;
  v_total         integer;
  v_old_current   integer;
  v_force_perdido boolean;
  v_last_event    timestamptz;
  v_sig_at        timestamptz;
  v_sig_type      text;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then return; end if;

  -- FIT — cada dimensión declarada aporta una sola vez.
  select coalesce(sum(points), 0) into v_fit
  from (
    select distinct on (r.dimension) r.points
    from   lead_score_rules r
    where  r.category = 'fit' and r.is_active
      and  (r.tenant_id = v_lead.tenant_id or r.tenant_id is null)
      and  v_lead.fit_profile ->> r.dimension = r.match_value
    order  by r.dimension, r.tenant_id nulls last
  ) f;

  -- MANUAL — lo que el agente registra. No decae.
  select coalesce(sum(pts), 0) into v_man
  from (
    select distinct on (e.id) r.points as pts
    from   lead_events e
    join   lead_score_rules r
           on  r.dimension = e.type and r.category = 'manual' and r.is_active
           and (r.tenant_id = e.tenant_id or r.tenant_id is null)
    where  e.lead_id = p_lead_id
    order  by e.id, r.tenant_id nulls last
  ) man;

  -- ENGAGEMENT SIN DECAER — alimenta la CALIDAD: el clic ocurrió, y que fuera
  -- hace dos meses no lo deshace. Lo que caduca es la urgencia, no el hecho.
  select coalesce(sum(pts), 0) into v_eng_raw
  from (
    select distinct on (e.id) r.points as pts
    from   lead_events e
    join   lead_score_rules r
           on  r.dimension = e.type and r.category = 'engagement' and r.is_active
           and (r.tenant_id = e.tenant_id or r.tenant_id is null)
    where  e.lead_id = p_lead_id
    order  by e.id, r.tenant_id nulls last
  ) engr;

  v_quality := greatest(0, least(100, v_fit + v_man + v_eng_raw));

  -- ÚLTIMA SEÑAL — sólo eventos POSITIVOS. Un hard bounce no hace urgente a
  -- nadie; de hecho es lo contrario.
  select e.created_at, e.type into v_sig_at, v_sig_type
  from   lead_events e
  join   lead_score_rules r
         on  r.dimension = e.type and r.is_active and r.points > 0
         and r.category in ('engagement', 'manual')
         and (r.tenant_id = e.tenant_id or r.tenant_id is null)
  where  e.lead_id = p_lead_id
  order  by e.created_at desc
  limit  1;

  v_old_current := coalesce(v_lead.current_score, 0);

  -- ENGAGEMENT DECAÍDO — alimenta el score interno. Cada evento decae por su
  -- cuenta: entero 14 días, luego a la mitad cada 30.
  select coalesce(sum(eff), 0) into v_eng
  from (
    select distinct on (e.id)
      case when r.decays then
        round(r.points::numeric * (
          case when (extract(epoch from (now() - e.created_at)) / 86400.0) <= 14 then 1
               else power(0.5, ((extract(epoch from (now() - e.created_at)) / 86400.0) - 14.0) / 30.0)
          end
        ))::integer
      else r.points end as eff
    from   lead_events e
    join   lead_score_rules r
           on  r.dimension = e.type and r.category = 'engagement' and r.is_active
           and (r.tenant_id = e.tenant_id or r.tenant_id is null)
    where  e.lead_id = p_lead_id
    order  by e.id, r.tenant_id nulls last
  ) eng;

  select exists (
    select 1
    from   lead_events e
    join   lead_score_rules r
           on  r.dimension = e.type and r.is_active and r.side_effect = 'force_perdido'
           and (r.tenant_id = e.tenant_id or r.tenant_id is null)
    where  e.lead_id = p_lead_id
  ) into v_force_perdido;

  v_total := case when v_force_perdido
                  then 0
                  else greatest(0, least(100, v_fit + v_eng + v_man)) end;

  select max(created_at) into v_last_event from lead_events where lead_id = p_lead_id;

  perform set_config('app.history_source', 'trigger', true);

  -- Un solo UPDATE. Ya no hay retorno anticipado por etapa: un lead en proceso
  -- o cerrado se sigue midiendo, que es lo que permite comparar calidad por
  -- fuente incluyendo los que cerraron.
  update leads
  set    fit_score        = v_fit,
         engagement_score = v_eng,
         manual_score     = v_man,
         quality_score    = v_quality,
         current_score    = v_total,
         peak_score       = greatest(coalesce(peak_score, 0), v_total),
         last_signal_at   = v_sig_at,
         last_signal_type = v_sig_type,
         last_event_at    = coalesce(v_last_event, last_event_at),
         score_updated_at = now(),
         stage            = case when v_force_perdido then 'perdido' else stage end
  where  id = p_lead_id;

  -- Aviso de lead caliente: sólo tiene sentido sobre la cartera viva. Avisar de
  -- uno que ya está en proceso o cerrado es ruido.
  -- Un recálculo masivo (recompute_scores_bulk, tras cambiar el modelo o
  -- calibrar un tenant) no es una señal del lead: avisar de "lead caliente" a
  -- cada agente cuyo lead cruzó 80 por un cambio de puntos sería ruido.
  if v_old_current < 80 and v_total >= 80 and not v_force_perdido
     and v_lead.stage in ('nuevo', 'nutricion')
     and coalesce(current_setting('app.bulk_recompute', true), '') <> 'on' then
    insert into notifications (tenant_id, type, lead_id, agent_id, message)
    values (
      v_lead.tenant_id,
      'hot_lead',
      p_lead_id,
      v_lead.agent_id,
      v_lead.first_name || ' ' || v_lead.last_name || ' alcanzó score ' || v_total
    );
  end if;
end;
$function$;

-- ── 4) recompute_scores_bulk ─────────────────────────────────────────────────
--
-- decay_lead_scores sólo recalcula leads con el último evento de hace más de
-- 14 días, así que un cambio de puntos no llegaba a los leads recientes hasta su
-- próximo evento. Esto recalcula todos (o los de un tenant) en el acto, sin
-- avisos de lead caliente. A la escala actual (cientos de leads) tarda segundos.

create or replace function public.recompute_scores_bulk(p_tenant_id text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id text;
  v_n  integer := 0;
begin
  perform set_config('app.bulk_recompute', 'on', true);
  for v_id in
    select id from leads where p_tenant_id is null or tenant_id = p_tenant_id
  loop
    perform recompute_lead_score(v_id);
    v_n := v_n + 1;
  end loop;
  perform set_config('app.bulk_recompute', 'off', true);
  return v_n;
end;
$function$;

revoke execute on function public.recompute_scores_bulk(text) from public, anon, authenticated;
grant execute on function public.recompute_scores_bulk(text) to service_role;

-- ── 5) Asistencia a un open house ────────────────────────────────────────────
--
-- setRsvpAttendance ya escribe el evento open_house_attended, pero ninguna regla
-- lo puntuaba. Es la señal automática más parecida a "visita atendida" (25), que
-- los agentes casi nunca registran a mano. Decae como el resto del engagement.

insert into lead_score_rules (tenant_id, category, dimension, match_value, points, decays, is_active, label)
select v.* from (values
  (null::text, 'engagement', 'open_house_attended', null::text, 25, true, true, 'Asistió a un open house')
) as v(tenant_id, category, dimension, match_value, points, decays, is_active, label)
where not exists (
  select 1 from lead_score_rules r
  where r.tenant_id is null and r.category = 'engagement' and r.dimension = v.dimension
);

-- ── 6) Registro de calibraciones ─────────────────────────────────────────────
--
-- Cada vez que cambia el orden de los factores de perfil de un tenant (lo
-- decide el cron con evidencia de cierres, o ITMANO a mano) queda aquí el antes,
-- el después y los puntos que cambiaron. Lo lee sólo el Centro de control.

create table if not exists public.scoring_calibrations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null references public.tenants(id) on delete cascade,
  source          text not null check (source in ('auto', 'manual', 'reset')),
  order_before    text[] not null,
  order_after     text[] not null,
  changes         jsonb not null default '[]'::jsonb,
  closes_with_fit integer not null default 0,
  actor_user_id   uuid,
  created_at      timestamptz not null default now()
);

create index if not exists scoring_calibrations_tenant_created
  on public.scoring_calibrations (tenant_id, created_at desc);

alter table public.scoring_calibrations enable row level security;

-- Idempotente sin borrar la policy: el MCP de Supabase pide confirmación ante
-- cualquier sentencia destructiva y la rechaza en clientes sin esa confirmación.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'scoring_calibrations'
      and policyname = 'scoring_calibrations_select_super_admin'
  ) then
    create policy scoring_calibrations_select_super_admin
      on public.scoring_calibrations for select
      to authenticated
      using ((select public.is_super_admin()));
  end if;
end;
$$;

revoke all on public.scoring_calibrations from anon;
grant select on public.scoring_calibrations to authenticated;
grant all on public.scoring_calibrations to service_role;

-- ── 7) Vista previa de un cambio de modelo ───────────────────────────────────
--
-- scoring_quality_preview replica el quality_score de recompute_lead_score
-- (fit + engagement sin decaer + manual, tope 0..100) para la cartera activa,
-- con los cambios de `p_changes` aplicados a las reglas GLOBALES
-- ([{ "id": uuid, "points": int, "isActive": bool }]). Sin cambios devuelve el
-- valor que tendría cada lead con el modelo vigente, que es la base justa para
-- comparar (quality_score guardado puede estar desfasado).

create or replace function public.scoring_quality_preview(p_changes jsonb)
returns table (lead_id text, tenant_id text, q integer)
language sql
stable
set search_path to ''
as $function$
  with ch as (
    select (x ->> 'id')::uuid as id,
           (x ->> 'points')::int as points,
           (x ->> 'isActive')::boolean as is_active
    from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) x
  ),
  rules as (
    select r.tenant_id, r.category, r.dimension, r.match_value,
           case when r.tenant_id is null and ch.id is not null then ch.points else r.points end as points,
           case when r.tenant_id is null and ch.id is not null then ch.is_active else r.is_active end as is_active
    from public.lead_score_rules r
    left join ch on ch.id = r.id
  ),
  pool as (
    select l.id, l.tenant_id, l.fit_profile
    from public.leads l
    where l.stage in ('nuevo', 'nutricion')
      and not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber')
  )
  select p.id, p.tenant_id,
         greatest(0, least(100, coalesce(f.pts, 0) + coalesce(e.pts, 0)))::int
  from pool p
  left join lateral (
    select sum(x.points) as pts from (
      select distinct on (r.dimension) r.points
      from rules r
      where r.category = 'fit' and r.is_active
        and (r.tenant_id = p.tenant_id or r.tenant_id is null)
        and p.fit_profile ->> r.dimension = r.match_value
      order by r.dimension, r.tenant_id nulls last
    ) x
  ) f on true
  left join lateral (
    select sum(x.points) as pts from (
      select distinct on (ev.id) r.points
      from public.lead_events ev
      join rules r
        on  r.dimension = ev.type and r.category in ('engagement', 'manual') and r.is_active
        and (r.tenant_id = ev.tenant_id or r.tenant_id is null)
      where ev.lead_id = p.id
      order by ev.id, r.tenant_id nulls last
    ) x
  ) e on true;
$function$;

-- Impacto por tenant: cuántos leads cambian de calidad y de banda, y cuántos
-- quedan en Alta antes y después. Las bandas "después" se calculan con los
-- quintiles nuevos (o los cortes fijos si quedan degenerados o hay < 20 leads),
-- igual que hará refresh_quality_bands al día siguiente.

create or replace function public.preview_score_rule_changes(p_changes jsonb)
returns table (
  tenant_id         text,
  tenant_name       text,
  active_leads      integer,
  score_changed     integer,
  band_changed      integer,
  alta_before       integer,
  alta_after        integer,
  degenerate_before boolean,
  degenerate_after  boolean
)
language sql
stable
set search_path to ''
as $function$
  with antes as (
    select * from public.scoring_quality_preview('[]'::jsonb)
  ),
  despues as (
    select * from public.scoring_quality_preview(p_changes)
  ),
  par as (
    select a.lead_id, a.tenant_id, a.q as q0, d.q as q1
    from antes a join despues d on d.lead_id = a.lead_id
  ),
  cortes as (
    select x.tenant_id, x.n,
           x.a20, x.a40, x.a60, x.a80, x.b20, x.b40, x.b60, x.b80,
           (x.a20 = x.a40 or x.a40 = x.a60 or x.a60 = x.a80 or x.a80 - x.a20 < 10) as deg0,
           (x.b20 = x.b40 or x.b40 = x.b60 or x.b60 = x.b80 or x.b80 - x.b20 < 10) as deg1
    from (
      select p.tenant_id, count(*)::int as n,
             percentile_cont(0.2) within group (order by p.q0)::int as a20,
             percentile_cont(0.4) within group (order by p.q0)::int as a40,
             percentile_cont(0.6) within group (order by p.q0)::int as a60,
             percentile_cont(0.8) within group (order by p.q0)::int as a80,
             percentile_cont(0.2) within group (order by p.q1)::int as b20,
             percentile_cont(0.4) within group (order by p.q1)::int as b40,
             percentile_cont(0.6) within group (order by p.q1)::int as b60,
             percentile_cont(0.8) within group (order by p.q1)::int as b80
      from par p
      group by p.tenant_id
    ) x
  ),
  bandas as (
    select p.tenant_id, p.q0, p.q1,
      case
        when c.n < 20 or c.deg0 then
          case when p.q0 >= 80 then 'alta' when p.q0 >= 60 then 'media_alta'
               when p.q0 >= 35 then 'media' when p.q0 >= 15 then 'media_baja' else 'baja' end
        else
          case when p.q0 >= c.a80 then 'alta' when p.q0 >= c.a60 then 'media_alta'
               when p.q0 >= c.a40 then 'media' when p.q0 >= c.a20 then 'media_baja' else 'baja' end
      end as band0,
      case
        when c.n < 20 or c.deg1 then
          case when p.q1 >= 80 then 'alta' when p.q1 >= 60 then 'media_alta'
               when p.q1 >= 35 then 'media' when p.q1 >= 15 then 'media_baja' else 'baja' end
        else
          case when p.q1 >= c.b80 then 'alta' when p.q1 >= c.b60 then 'media_alta'
               when p.q1 >= c.b40 then 'media' when p.q1 >= c.b20 then 'media_baja' else 'baja' end
      end as band1
    from par p
    join cortes c on c.tenant_id = p.tenant_id
  )
  select t.id, t.name,
         count(*)::int,
         count(*) filter (where b.q0 <> b.q1)::int,
         count(*) filter (where b.band0 <> b.band1)::int,
         count(*) filter (where b.band0 = 'alta')::int,
         count(*) filter (where b.band1 = 'alta')::int,
         bool_or(c.n >= 20 and c.deg0),
         bool_or(c.n >= 20 and c.deg1)
  from bandas b
  join public.tenants t on t.id = b.tenant_id
  join cortes c on c.tenant_id = b.tenant_id
  group by t.id, t.name
  order by t.name;
$function$;

revoke execute on function public.scoring_quality_preview(jsonb) from public, anon, authenticated;
grant execute on function public.scoring_quality_preview(jsonb) to service_role;
revoke execute on function public.preview_score_rule_changes(jsonb) from public, anon, authenticated;
grant execute on function public.preview_score_rule_changes(jsonb) to service_role;

-- ── 8) Salud del scoring y uso de las reglas ─────────────────────────────────
--
-- Lo que el Centro de control necesita para avisar sin que nadie revise listas:
-- ¿los leads declaran perfil?, ¿las bandas distinguen?, ¿cuántos cierres con
-- perfil faltan para calibrar?, ¿alguien registra acciones manuales?

create or replace function public.scoring_health(p_tenant_id text)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with pool as (
    select l.quality_score, l.fit_profile
    from public.leads l
    where l.tenant_id = p_tenant_id
      and l.stage in ('nuevo', 'nutricion')
      and not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber')
  ),
  empates as (
    select coalesce(quality_score, 0) as q, count(*) as n from pool group by 1
  ),
  recientes as (
    select count(*) as total,
           count(*) filter (where fit_profile is not null and fit_profile <> '{}'::jsonb) as con_perfil
    from public.leads
    where tenant_id = p_tenant_id and created_at > now() - interval '90 days'
  ),
  cierres as (
    select count(*) as total,
           count(*) filter (where fit_profile is not null and fit_profile <> '{}'::jsonb) as con_perfil
    from public.leads
    where tenant_id = p_tenant_id and stage = 'cerrado'
  ),
  manuales as (
    select count(*) as n
    from public.lead_events e
    where e.tenant_id = p_tenant_id
      and e.created_at > now() - interval '90 days'
      and e.type in (select r.dimension from public.lead_score_rules r where r.category = 'manual')
  ),
  overrides as (
    select count(*) as n from public.lead_score_rules where tenant_id = p_tenant_id
  )
  select jsonb_build_object(
    'active_leads',       (select count(*) from pool),
    'active_with_fit',    (select count(*) from pool where fit_profile is not null and fit_profile <> '{}'::jsonb),
    'distinct_scores',    (select count(*) from empates),
    'top_tie',            (select coalesce(max(n), 0) from empates),
    'recent_leads',       recientes.total,
    'recent_with_fit',    recientes.con_perfil,
    'closes',             cierres.total,
    'closes_with_fit',    cierres.con_perfil,
    'manual_actions_90d', manuales.n,
    'overrides',          overrides.n,
    'bands', (
      select jsonb_build_object(
        'p20', b.p20, 'p40', b.p40, 'p60', b.p60, 'p80', b.p80,
        'active_leads', b.active_leads, 'degenerate', b.degenerate,
        'computed_at', b.computed_at
      )
      from public.tenant_quality_bands b
      where b.tenant_id = p_tenant_id
    )
  )
  from recientes, cierres, manuales, overrides;
$function$;

-- Cuántas veces se activó cada regla global en los últimos `p_days` días, de un
-- tenant o de todos (p_tenant_id null). Para perfil cuenta los leads creados en
-- la ventana que declararon ese valor; para actividad y acciones, los eventos.

create or replace function public.scoring_rule_usage(p_tenant_id text default null, p_days integer default 90)
returns table (category text, dimension text, match_value text, hits bigint, leads bigint)
language sql
stable
set search_path to ''
as $function$
  select r.category, r.dimension, r.match_value::text, count(e.id), count(distinct e.lead_id)
  from public.lead_score_rules r
  left join public.lead_events e
    on  e.type = r.dimension
    and e.created_at > now() - make_interval(days => p_days)
    and (p_tenant_id is null or e.tenant_id = p_tenant_id)
  where r.tenant_id is null and r.category in ('engagement', 'manual')
  group by r.category, r.dimension, r.match_value
  union all
  select r.category, r.dimension, r.match_value, count(l.id), count(l.id)
  from public.lead_score_rules r
  left join public.leads l
    on  l.fit_profile ->> r.dimension = r.match_value
    and l.created_at > now() - make_interval(days => p_days)
    and (p_tenant_id is null or l.tenant_id = p_tenant_id)
  where r.tenant_id is null and r.category = 'fit'
  group by r.category, r.dimension, r.match_value;
$function$;

revoke execute on function public.scoring_health(text) from public, anon, authenticated;
grant execute on function public.scoring_health(text) to service_role;
revoke execute on function public.scoring_rule_usage(text, integer) from public, anon, authenticated;
grant execute on function public.scoring_rule_usage(text, integer) to service_role;
