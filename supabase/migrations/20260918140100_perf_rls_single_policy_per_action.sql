-- Auditoría de rendimiento, fase 2 (2026-09): una sola política permisiva por
-- acción en las cinco tablas que el performance advisor señalaba
-- (multiple_permissive_policies). Con dos políticas permisivas para la misma
-- acción Postgres evalúa las dos en cada fila; con una, una. Lo que cada rol
-- puede ver o tocar no cambia: se fusionan las condiciones con OR, o se
-- separan por acción donde se solapaban.
--
-- Las funciones van envueltas en `(select ...)` para que el planificador las
-- evalúe una vez por consulta (initplan) y no una vez por fila.
--
-- newsletter_editions y properties: la política del tenant estaba declarada
-- para `public` y se solapaba con la política pública de `anon` en SELECT.
-- Para `anon`, is_super_admin() es false y get_my_tenant_id() es null, así que
-- esa política nunca le dejaba pasar una fila: acotarla a `authenticated` no
-- cambia lo que anon ve (sigue viendo sólo lo publicado, por su propia
-- política) y deja una sola política por rol y acción.

-- ── agent_email_drafts ───────────────────────────────────────────────────────

drop policy if exists "super_admin: agent_email_drafts"      on public.agent_email_drafts;
drop policy if exists "tenant isolation: agent_email_drafts" on public.agent_email_drafts;

create policy agent_email_drafts_all on public.agent_email_drafts
  for all
  using      ((select public.is_super_admin()) or tenant_id = (select public.get_my_tenant_id()))
  with check ((select public.is_super_admin()) or tenant_id = (select public.get_my_tenant_id()));

-- ── lead_sequence_runs ───────────────────────────────────────────────────────

drop policy if exists "super_admin: lead_sequence_runs"      on public.lead_sequence_runs;
drop policy if exists "tenant isolation: lead_sequence_runs" on public.lead_sequence_runs;

create policy lead_sequence_runs_all on public.lead_sequence_runs
  for all
  using      ((select public.is_super_admin()) or tenant_id = (select public.get_my_tenant_id()))
  with check ((select public.is_super_admin()) or tenant_id = (select public.get_my_tenant_id()));

-- ── lead_score_rules ─────────────────────────────────────────────────────────
-- La política de escritura del super_admin era `for all`, así que también
-- contaba como SELECT y se solapaba con la de lectura. Se parte en insert,
-- update y delete; la lectura queda como estaba.

drop policy if exists lead_score_rules_write_super_admin on public.lead_score_rules;
drop policy if exists lead_score_rules_select            on public.lead_score_rules;

create policy lead_score_rules_select on public.lead_score_rules
  for select
  using ((select public.is_super_admin()) or tenant_id is null or tenant_id = (select public.get_my_tenant_id()));

create policy lead_score_rules_insert_super_admin on public.lead_score_rules
  for insert
  with check ((select public.is_super_admin()));

create policy lead_score_rules_update_super_admin on public.lead_score_rules
  for update
  using      ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

create policy lead_score_rules_delete_super_admin on public.lead_score_rules
  for delete
  using ((select public.is_super_admin()));

-- ── newsletter_editions y properties ─────────────────────────────────────────

drop policy if exists newsletter_editions_select on public.newsletter_editions;
create policy newsletter_editions_select on public.newsletter_editions
  for select
  to authenticated
  using ((select public.is_super_admin()) or tenant_id = (select public.get_my_tenant_id()));

drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties
  for select
  to authenticated
  using ((select public.is_super_admin()) or tenant_id = (select public.get_my_tenant_id()));
