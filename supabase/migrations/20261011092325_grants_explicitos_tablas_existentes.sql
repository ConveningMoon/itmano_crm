-- Grants explícitos para las 32 tablas de `public` que sólo los tenían por el
-- default ACL.
--
-- Desde el 2026-10-30 Supabase deja de conceder privilegios por defecto a las
-- tablas nuevas de `public` (changelog 45329). Las bases actuales conservan sus
-- grants, pero una base reconstruida desde supabase/migrations/ (proyecto nuevo,
-- branch o `db reset`) crearía estas tablas sin ningún privilegio: ni el admin
-- client ni los usuarios podrían usarlas. Las otras 11 tablas de `public`
-- (105, 109, 115, 116 y open houses) ya traen sus grants en su migración.
--
-- En sandbox y producción esta migración no cambia nada: GRANT sólo suma, y los
-- tres roles ya tienen estos privilegios.
--
-- `anon` no recibe grants de tabla aquí, salvo SELECT sobre `tenants` para
-- `/api/health`, que consulta sin sesión (RLS le devuelve cero filas). Lo que
-- las webs de clientes leen con la publishable key (properties, newsletter_editions
-- y open_houses) va por columna en su propia migración. Las bases actuales
-- conservan los grants de `anon` que el default ACL les dio; RLS no le deja ver
-- ni escribir nada con ellos. Retirarlos es una decisión aparte, con su propio
-- `revoke`.

grant select, insert, update, delete on
  public.acquisition_channels,
  public.agent_email_drafts,
  public.agent_idempotency_keys,
  public.agent_rate_limits,
  public.agent_tokens,
  public.agents,
  public.ai_briefings,
  public.ai_usage_events,
  public.channel_page_views,
  public.email_sends,
  public.email_sequence_steps,
  public.email_sequences,
  public.form_submissions,
  public.invitations,
  public.lead_email_replies,
  public.lead_events,
  public.lead_score_rules,
  public.lead_sequence_runs,
  public.lead_status_history,
  public.leads,
  public.notifications,
  public.paddle_webhook_events,
  public.platform_requests,
  public.properties,
  public.purchase_email_templates,
  public.purchase_processes,
  public.studio_images,
  public.studio_templates,
  public.subscriptions,
  public.tenant_quality_bands,
  public.tenants,
  public.user_profiles
to authenticated, service_role;

grant select on public.tenants to anon;
