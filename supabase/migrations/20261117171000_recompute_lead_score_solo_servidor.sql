-- recompute_lead_score es SECURITY DEFINER y estaba abierta a `authenticated`
-- (advisor 0029): cualquier usuario con sesión podía forzar el recálculo de un
-- lead de OTRO tenant por /rest/v1/rpc, pasando sólo su id. No filtraba datos,
-- pero cruzaba el aislamiento por tenant.
--
-- Quién la llama hoy: el servidor con service_role (alta, importación, intake,
-- acciones del agente) y tres funciones SECURITY DEFINER (decay_lead_scores,
-- recalc_lead_score, apply_lead_event_scoring), que corren como su dueño. Ningún
-- cliente con la sesión del usuario la invoca.
--
-- get_my_tenant_id() e is_super_admin() NO se tocan: las usan políticas RLS
-- `to public`, que también evalúa `anon` (p. ej. tenants_select para
-- /api/health); retirarles EXECUTE rompería esas lecturas.

revoke execute on function public.recompute_lead_score(text) from public, anon, authenticated;
grant execute on function public.recompute_lead_score(text) to service_role;
