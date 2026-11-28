-- Salud del scoring con desglose por canal.
--
-- La alerta "la calidad no distingue entre leads" decía QUÉ pasaba, pero no
-- DE DÓNDE venía. En noviembre de 2026, 49 de los 71 leads activos de un tenant
-- real sumaban exactamente 30: eran registros de asistencia a eventos (sin
-- preguntas de perfil, a propósito) que no estaban en ninguna secuencia de
-- correo, así que no tenían cómo hacer clic ni responder. La alerta, en cambio,
-- sugería que "los formularios no hacen esas preguntas", que para un registro
-- de asistencia no es un fallo.
--
-- scoring_health añade:
--   * mode_score: el puntaje en el que empata más gente.
--   * channels: por canal de la cartera activa, cuántos leads hay, cuántos con
--     perfil, cuántos en el empate y cuántos pasaron por una secuencia.
--   * recent_form_* / active_form_*: la cobertura de perfil medida sólo sobre
--     los canales que califican (lead magnet, contacto, ManyChat). Eventos,
--     newsletter y leads sin canal no preguntan perfil por diseño.
--
-- Los campos anteriores se conservan con el mismo significado: el código ya
-- desplegado los sigue leyendo hasta que salga el nuevo.

create or replace function public.scoring_health(p_tenant_id text)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with pool as (
    select l.id, l.quality_score, l.fit_profile, l.acquisition_channel_id
    from public.leads l
    where l.tenant_id = p_tenant_id
      and l.stage in ('nuevo', 'nutricion')
      and not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber')
  ),
  empates as (
    select coalesce(quality_score, 0) as q, count(*) as n from pool group by 1
  ),
  moda as (
    select q from empates order by n desc, q limit 1
  ),
  canales as (
    select
      p.acquisition_channel_id                                as channel_id,
      c.name,
      c.channel_type,
      coalesce(c.email_sequence_id is not null, false)        as channel_has_sequence,
      count(*)                                                as leads,
      count(*) filter (where p.fit_profile is not null and p.fit_profile <> '{}'::jsonb) as with_fit,
      count(*) filter (where coalesce(p.quality_score, 0) = (select q from moda))        as at_mode,
      count(*) filter (where exists (
        select 1 from public.lead_sequence_runs r
        where r.lead_id = p.id and r.tenant_id = p_tenant_id
      ))                                                      as in_sequence,
      count(*) filter (where (p.fit_profile is null or p.fit_profile = '{}'::jsonb)
        and not exists (
          select 1 from public.lead_sequence_runs r
          where r.lead_id = p.id and r.tenant_id = p_tenant_id
        ))                                                    as stuck
    from pool p
    left join public.acquisition_channels c
      on c.id = p.acquisition_channel_id and c.tenant_id = p_tenant_id
    group by 1, 2, 3, 4
  ),
  recientes as (
    select count(*) as total,
           count(*) filter (where fit_profile is not null and fit_profile <> '{}'::jsonb) as con_perfil
    from public.leads
    where tenant_id = p_tenant_id and created_at > now() - interval '90 days'
  ),
  -- Canales que califican: los únicos donde tiene sentido esperar perfil.
  formularios as (
    select
      count(*) filter (where l.created_at > now() - interval '90 days') as recientes,
      count(*) filter (where l.created_at > now() - interval '90 days'
                         and l.fit_profile is not null and l.fit_profile <> '{}'::jsonb) as recientes_con_perfil,
      count(*) filter (where l.stage in ('nuevo', 'nutricion')) as activos,
      count(*) filter (where l.stage in ('nuevo', 'nutricion')
                         and l.fit_profile is not null and l.fit_profile <> '{}'::jsonb) as activos_con_perfil
    from public.leads l
    join public.acquisition_channels c
      on c.id = l.acquisition_channel_id and c.tenant_id = p_tenant_id
    where l.tenant_id = p_tenant_id
      and c.channel_type in ('lead_magnet', 'contact_form', 'manychat_flow')
      and not jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber')
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
    'active_with_fit',      (select count(*) from pool where fit_profile is not null and fit_profile <> '{}'::jsonb),
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
        'leads',                ch.leads,
        'with_fit',             ch.with_fit,
        'at_mode',              ch.at_mode,
        'in_sequence',          ch.in_sequence,
        'stuck',                ch.stuck
      ) order by ch.leads desc, ch.name)
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
