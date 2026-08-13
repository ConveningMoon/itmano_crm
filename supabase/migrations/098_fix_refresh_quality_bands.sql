-- 098 — refresh_quality_bands seguia leyendo leads.status.
--
-- La 083 borro esa columna y no actualizo esta funcion, que viene de la 076. El
-- cron diario (/api/cron/score-decay) la llama por RPC, loguea el error y sigue,
-- asi que la falla no rompe nada visible: simplemente tenant_quality_bands dejo
-- de recalcularse el dia que se aplico la 083.
--
-- Sin fila en tenant_quality_bands, leads_list cae al camino de "menos de 20
-- leads activos" y usa los cortes fijos (80/60/35/15) en lugar de los quintiles
-- de la cartera del tenant. Es decir: la banda de calidad dejo de ser relativa a
-- la cartera, que es justamente lo que la hace util.
--
-- La traduccion del vocabulario viejo al de la 082 es literal, para no cambiar
-- de paso la definicion de "cartera activa":
--   process_started -> en_proceso · process_completed / closed -> cerrado · lost -> perdido
create or replace function public.refresh_quality_bands()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer := 0;
begin
  insert into tenant_quality_bands (tenant_id, p20, p40, p60, p80, active_leads, computed_at)
  select
    t.tenant_id,
    percentile_cont(0.2) within group (order by t.q)::int,
    percentile_cont(0.4) within group (order by t.q)::int,
    percentile_cont(0.6) within group (order by t.q)::int,
    percentile_cont(0.8) within group (order by t.q)::int,
    count(*)::int,
    now()
  from (
    select l.tenant_id, coalesce(l.quality_score, 0) as q
    from   leads l
    -- Solo cartera VIVA: cerrar un buen lead no debe degradar a los demás.
    where  l.stage not in ('en_proceso','cerrado','perdido')
  ) t
  group by t.tenant_id
  on conflict (tenant_id) do update
  set p20 = excluded.p20, p40 = excluded.p40, p60 = excluded.p60,
      p80 = excluded.p80, active_leads = excluded.active_leads,
      computed_at = excluded.computed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.refresh_quality_bands() from public, anon, authenticated;
grant execute on function public.refresh_quality_bands() to service_role;
