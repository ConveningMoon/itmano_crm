-- Auditoría de rendimiento (2026-09): los dos avisos de performance advisor que
-- tienen arreglo sin cambiar comportamiento.
--
-- 1. Índices para las FK sin índice. Sin ellos, borrar la fila padre (un lead,
--    un agente, una propiedad) escanea la tabla hija entera para cumplir la FK,
--    y los joins/filtros por esas columnas también. Las tablas hoy son chicas;
--    el costo de mantener estos índices también lo es.
create index if not exists agent_email_drafts_lead_id_idx
  on public.agent_email_drafts (lead_id);
create index if not exists agent_tokens_bot_user_id_idx
  on public.agent_tokens (bot_user_id);
create index if not exists agent_tokens_tenant_id_idx
  on public.agent_tokens (tenant_id);
create index if not exists ai_briefings_agent_id_idx
  on public.ai_briefings (agent_id);
create index if not exists folders_tenant_id_idx
  on public.folders (tenant_id);
create index if not exists lead_tag_assignments_assigned_by_idx
  on public.lead_tag_assignments (assigned_by);
create index if not exists newsletter_editions_author_agent_id_idx
  on public.newsletter_editions (author_agent_id);
create index if not exists newsletter_editions_created_by_agent_id_idx
  on public.newsletter_editions (created_by_agent_id);
create index if not exists platform_requests_tenant_id_idx
  on public.platform_requests (tenant_id);
create index if not exists studio_images_agent_id_idx
  on public.studio_images (agent_id);
create index if not exists studio_images_created_by_idx
  on public.studio_images (created_by);
create index if not exists studio_images_property_id_idx
  on public.studio_images (property_id);

-- 2. studio_templates_select evaluaba auth.role() por fila (auth_rls_initplan) y
--    además usa auth.role(), que Supabase marcó como obsoleto. `to authenticated`
--    expresa la misma regla en la cláusula de rol: anon sigue sin leer y
--    service_role sigue saltándose RLS.
drop policy if exists "studio_templates_select" on public.studio_templates;
create policy "studio_templates_select"
  on public.studio_templates
  for select
  to authenticated
  using (true);
