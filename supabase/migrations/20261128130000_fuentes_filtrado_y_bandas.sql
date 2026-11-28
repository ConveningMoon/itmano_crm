-- Fuentes con y sin preguntas de filtrado, y bandas de calidad que no inflan
-- los empates.
--
-- 1) acquisition_channels.asks_fit_questions
--    Hay fuentes que a propósito no preguntan perfil: el registro de asistencia
--    a un evento, por ejemplo, sólo pide nombre y acompañantes; la señal de esos
--    leads tiene que llegar después, por los correos. Antes la salud del scoring
--    lo deducía del tipo de canal, que falla en los dos sentidos (un evento puede
--    preguntar; un lead magnet puede no hacerlo). null = según el tipo:
--    lead magnet, contacto y ManyChat preguntan; eventos, newsletter y manual no.
--    La misma regla vive en src/lib/sources/fit-questions.ts.
--
-- 2) quality_band_for(): una sola definición de la banda para leads_list y
--    preview_score_rule_changes. Un empate que abarca varios cortes queda en la
--    banda MÁS BAJA que toca. Antes, con p20 = p40 = p60 = 30, los empatados en
--    30 caían en "media-alta" por la comparación >=. Sin empates el resultado es
--    idéntico al anterior.
--
-- 3) degenerate: antes bastaba con dos cortes iguales. En una cartera de
--    nutrición la mayoría nunca hace clic y se queda en el puntaje de entrada,
--    así que p20 = p40 aunque los de arriba se distingan perfectamente: la
--    alerta no se iba nunca. Ahora sólo es degenerado si ningún lead queda en
--    "alta" o si el más bajo de "alta" le saca menos de 5 puntos (la señal más
--    pequeña del modelo) a la mediana. Medido en producción (28-11-2026): el
--    tenant afectado pasa de 0 a 12 leads en "alta", los 12 con perfil; el resto
--    no cambia.

-- ── 1) Propiedad de la fuente ────────────────────────────────────────────────

alter table public.acquisition_channels
  add column if not exists asks_fit_questions boolean;

comment on column public.acquisition_channels.asks_fit_questions is
  'La fuente hace preguntas de filtrado (plazo, financiamiento, presupuesto…). null = según channel_type (ver channel_asks_fit_questions).';

create or replace function public.channel_asks_fit_questions(p_channel_type text, p_explicit boolean)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select coalesce(p_explicit, p_channel_type in ('lead_magnet', 'contact_form', 'manychat_flow'), false);
$function$;

-- ── 2) Banda de calidad ──────────────────────────────────────────────────────

create or replace function public.quality_band_for(
  p_q integer, p_p20 integer, p_p40 integer, p_p60 integer, p_p80 integer, p_fixed boolean
)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_fixed then
      case
        when p_q >= 80 then 'alta'
        when p_q >= 60 then 'media_alta'
        when p_q >= 35 then 'media'
        when p_q >= 15 then 'media_baja'
        else 'baja'
      end
    else
      -- Un corte igual al de abajo no cuenta para quien está justo en él: el
      -- empate se queda en la banda inferior en vez de subir de golpe.
      case
        when p_q > p_p80 or (p_q = p_p80 and p_p80 > p_p60) then 'alta'
        when p_q > p_p60 or (p_q = p_p60 and p_p60 > p_p40) then 'media_alta'
        when p_q > p_p40 or (p_q = p_p40 and p_p40 > p_p20) then 'media'
        when p_q >= p_p20                                    then 'media_baja'
        else 'baja'
      end
  end;
$function$;

-- ── 3) Bandas por tenant ─────────────────────────────────────────────────────

comment on column public.tenant_quality_bands.degenerate is
  'true si ningún lead se separa del grueso (nadie en "alta", o el más bajo de "alta" a menos de 5 puntos de la mediana): leads_list usa los cortes fijos.';

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
    (a.alta_min is null or a.alta_min - c.p50 < 5),
    now()
  from (
    select
      t.tenant_id,
      percentile_cont(0.2) within group (order by t.q)::int as p20,
      percentile_cont(0.4) within group (order by t.q)::int as p40,
      percentile_cont(0.5) within group (order by t.q)::int as p50,
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
  -- El lead más bajo que quedaría en "alta" con estos cortes.
  left join lateral (
    select min(coalesce(l.quality_score, 0)) as alta_min
    from   leads l
    where  l.tenant_id = c.tenant_id
      and  l.stage not in ('en_proceso','cerrado','perdido')
      and  not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber')
      and  quality_band_for(coalesce(l.quality_score, 0), c.p20, c.p40, c.p60, c.p80, false) = 'alta'
  ) a on true
  on conflict (tenant_id) do update
  set p20 = excluded.p20, p40 = excluded.p40, p60 = excluded.p60,
      p80 = excluded.p80, active_leads = excluded.active_leads,
      degenerate = excluded.degenerate,
      computed_at = excluded.computed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- ── 4) leads_list ────────────────────────────────────────────────────────────
--
-- Misma definición viva que la 20261118120000; sólo cambia quality_band, que
-- pasa a quality_band_for(). create or replace conserva columnas, orden y
-- permisos.

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

  public.quality_band_for(
    coalesce(l.quality_score, 0), b.p20, b.p40, b.p60, b.p80,
    coalesce(b.active_leads, 0) < 20 or coalesce(b.degenerate, false)
  ) as quality_band,

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

-- ── 5) Vista previa de un cambio de puntos ───────────────────────────────────
--
-- Misma regla que refresh_quality_bands y la misma banda que leads_list.

create or replace function public.preview_score_rule_changes(p_changes jsonb)
returns table (
  tenant_id text, tenant_name text, active_leads integer, score_changed integer,
  band_changed integer, alta_before integer, alta_after integer,
  degenerate_before boolean, degenerate_after boolean
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
  cuantiles as (
    select p.tenant_id, count(*)::int as n,
           percentile_cont(0.2) within group (order by p.q0)::int as a20,
           percentile_cont(0.4) within group (order by p.q0)::int as a40,
           percentile_cont(0.5) within group (order by p.q0)::int as a50,
           percentile_cont(0.6) within group (order by p.q0)::int as a60,
           percentile_cont(0.8) within group (order by p.q0)::int as a80,
           percentile_cont(0.2) within group (order by p.q1)::int as b20,
           percentile_cont(0.4) within group (order by p.q1)::int as b40,
           percentile_cont(0.5) within group (order by p.q1)::int as b50,
           percentile_cont(0.6) within group (order by p.q1)::int as b60,
           percentile_cont(0.8) within group (order by p.q1)::int as b80
    from par p
    group by p.tenant_id
  ),
  cortes as (
    select x.*,
      (m.alta0 is null or m.alta0 - x.a50 < 5) as deg0,
      (m.alta1 is null or m.alta1 - x.b50 < 5) as deg1
    from cuantiles x
    left join lateral (
      select
        min(p.q0) filter (where public.quality_band_for(p.q0, x.a20, x.a40, x.a60, x.a80, false) = 'alta') as alta0,
        min(p.q1) filter (where public.quality_band_for(p.q1, x.b20, x.b40, x.b60, x.b80, false) = 'alta') as alta1
      from par p
      where p.tenant_id = x.tenant_id
    ) m on true
  ),
  bandas as (
    select p.tenant_id, p.q0, p.q1,
      public.quality_band_for(p.q0, c.a20, c.a40, c.a60, c.a80, c.n < 20 or c.deg0) as band0,
      public.quality_band_for(p.q1, c.b20, c.b40, c.b60, c.b80, c.n < 20 or c.deg1) as band1
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

-- ── 6) Salud del scoring por fuente ──────────────────────────────────────────
--
-- Sustituye a la 20261128120000: la cobertura de perfil y los leads "sin forma
-- de sumar" se separan por la propiedad de la fuente, no por su tipo. Cada
-- canal trae además sus leads de los últimos 90 días, para señalar la fuente
-- concreta que dice filtrar y llega sin perfil.

create or replace function public.scoring_health(p_tenant_id text)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with base as (
    select
      l.id,
      l.acquisition_channel_id,
      coalesce(l.quality_score, 0)                                    as q,
      l.stage in ('nuevo', 'nutricion')                               as activo,
      l.created_at > now() - interval '90 days'                       as reciente,
      (l.fit_profile is not null and l.fit_profile <> '{}'::jsonb)    as con_perfil,
      exists (
        select 1 from public.lead_sequence_runs r
        where r.lead_id = l.id and r.tenant_id = p_tenant_id
      )                                                               as en_secuencia
    from public.leads l
    where l.tenant_id = p_tenant_id
      and not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber')
  ),
  pool as (
    select * from base where activo
  ),
  empates as (
    select q, count(*) as n from pool group by 1
  ),
  moda as (
    select q from empates order by n desc, q limit 1
  ),
  canales as (
    select
      b.acquisition_channel_id                                        as channel_id,
      c.name,
      c.channel_type,
      coalesce(c.email_sequence_id is not null, false)                as channel_has_sequence,
      public.channel_asks_fit_questions(c.channel_type, c.asks_fit_questions) as asks_fit_questions,
      count(*) filter (where b.activo)                                as leads,
      count(*) filter (where b.activo and b.con_perfil)               as with_fit,
      count(*) filter (where b.activo and b.q = (select q from moda)) as at_mode,
      count(*) filter (where b.activo and b.en_secuencia)             as in_sequence,
      count(*) filter (where b.activo and not b.con_perfil and not b.en_secuencia) as stuck,
      count(*) filter (where b.reciente)                              as recent_leads,
      count(*) filter (where b.reciente and b.con_perfil)             as recent_with_fit
    from base b
    left join public.acquisition_channels c
      on c.id = b.acquisition_channel_id and c.tenant_id = p_tenant_id
    where b.activo or b.reciente
    group by 1, 2, 3, 4, 5
  ),
  recientes as (
    select count(*) as total,
           count(*) filter (where fit_profile is not null and fit_profile <> '{}'::jsonb) as con_perfil
    from public.leads
    where tenant_id = p_tenant_id and created_at > now() - interval '90 days'
  ),
  formularios as (
    select
      coalesce(sum(recent_leads), 0)    as recientes,
      coalesce(sum(recent_with_fit), 0) as recientes_con_perfil,
      coalesce(sum(leads), 0)           as activos,
      coalesce(sum(with_fit), 0)        as activos_con_perfil
    from canales
    where asks_fit_questions
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
    'active_leads',         (select count(*) from pool),
    'active_with_fit',      (select count(*) from pool where con_perfil),
    'distinct_scores',      (select count(*) from empates),
    'top_tie',              (select coalesce(max(n), 0) from empates),
    'mode_score',           (select q from moda),
    'recent_leads',         recientes.total,
    'recent_with_fit',      recientes.con_perfil,
    'recent_form_leads',    formularios.recientes,
    'recent_form_with_fit', formularios.recientes_con_perfil,
    'active_form_leads',    formularios.activos,
    'active_form_with_fit', formularios.activos_con_perfil,
    'closes',               cierres.total,
    'closes_with_fit',      cierres.con_perfil,
    'manual_actions_90d',   manuales.n,
    'overrides',            overrides.n,
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'channel_id',           ch.channel_id,
        'name',                 ch.name,
        'channel_type',         ch.channel_type,
        'channel_has_sequence', ch.channel_has_sequence,
        'asks_fit_questions',   ch.asks_fit_questions,
        'leads',                ch.leads,
        'with_fit',             ch.with_fit,
        'at_mode',              ch.at_mode,
        'in_sequence',          ch.in_sequence,
        'stuck',                ch.stuck,
        'recent_leads',         ch.recent_leads,
        'recent_with_fit',      ch.recent_with_fit
      ) order by ch.leads desc, ch.recent_leads desc, ch.name)
      from canales ch
    ), '[]'::jsonb),
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
  from recientes, formularios, cierres, manuales, overrides;
$function$;

revoke execute on function public.scoring_health(text) from public, anon, authenticated;
grant execute on function public.scoring_health(text) to service_role;
revoke execute on function public.preview_score_rule_changes(jsonb) from public, anon, authenticated;
grant execute on function public.preview_score_rule_changes(jsonb) to service_role;
revoke execute on function public.refresh_quality_bands() from public, anon, authenticated;
grant execute on function public.refresh_quality_bands() to service_role;
