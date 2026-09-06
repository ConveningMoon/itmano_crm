-- Recuperada del historial de producción, donde se aplicó suelta el 2026-08-04
-- entre la 088 y la 090 sin dejar archivo en el repo. Va al final de la serie
-- porque su hueco cronológico ya está ocupado; el orden no altera el resultado,
-- es un `create or replace` de una función que nada posterior vuelve a tocar.
--
-- channel_metrics: separar ADQUISICION de ACTIVIDAD.
--
-- `leads` cuenta los leads que ESTE canal adquirio (leads.acquisition_channel_id).
-- Un visitante que ya era lead y vuelve a llenar otro formulario no se cuenta
-- ahi, y es correcto: se adquirio una vez. Pero dejaba al canal con un cero mudo
-- aunque hubiera traido actividad real.
--
-- La conversion pasa a ser ENVIOS / VISTAS: cuanta gente que vio la pagina la
-- lleno. Antes era leads/vistas, que castigaba a la pagina por algo que paso en
-- otro canal — un visitante que ya era lead igual convirtio.
--
-- Y devuelve null cuando no hay vistas: un 0% afirma que nadie convirtio; sin
-- denominador la verdad es "no lo se".
create or replace function public.channel_metrics(p_channel_ids uuid[], p_window_days integer default 30)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with bounds as (
    select now() - make_interval(days => greatest(coalesce(p_window_days, 30), 1)) as window_start
  ),
  ids as (
    select unnest(coalesce(p_channel_ids, '{}'::uuid[])) as channel_id
  ),
  lead_agg as (
    select
      l.acquisition_channel_id                                                as channel_id,
      count(*)::int                                                           as leads_total,
      (count(*) filter (where l.created_at >= b.window_start))::int           as leads_in_window,
      avg(l.current_score) filter (
        where l.created_at >= b.window_start and l.current_score is not null
      )                                                                       as avg_score
    from public.leads l, bounds b
    where l.acquisition_channel_id in (select channel_id from ids)
    group by l.acquisition_channel_id
  ),
  sub_agg as (
    select
      s.channel_id,
      count(*)::int                                                           as subs_total,
      (count(*) filter (where s.submitted_at >= b.window_start))::int         as subs_in_window
    from public.form_submissions s, bounds b
    where s.channel_id in (select channel_id from ids)
    group by s.channel_id
  ),
  view_agg as (
    select
      pv.channel_id,
      (count(distinct pv.visitor_fingerprint)
        + count(*) filter (where pv.visitor_fingerprint is null))::int         as views
    from public.channel_page_views pv, bounds b
    where pv.channel_id in (select channel_id from ids)
      and pv.created_at >= b.window_start
    group by pv.channel_id
  )
  select coalesce(
    jsonb_object_agg(
      i.channel_id,
      jsonb_build_object(
        'leads_total',            coalesce(l.leads_total, 0),
        'leads_in_window',        coalesce(l.leads_in_window, 0),
        'submissions_total',      coalesce(s.subs_total, 0),
        'submissions_in_window',  coalesce(s.subs_in_window, 0),
        'page_views_in_window',   coalesce(v.views, 0),
        'conversion_rate',        case
                                    when coalesce(v.views, 0) > 0
                                    then round((coalesce(s.subs_in_window, 0)::numeric / v.views) * 100)::int
                                  end,
        'avg_temp_score',         case when l.avg_score is null then null else round(l.avg_score)::int end
      )
    ),
    '{}'::jsonb
  )
  from ids i
  left join lead_agg l on l.channel_id = i.channel_id
  left join sub_agg  s on s.channel_id = i.channel_id
  left join view_agg v on v.channel_id = i.channel_id;
$function$;
