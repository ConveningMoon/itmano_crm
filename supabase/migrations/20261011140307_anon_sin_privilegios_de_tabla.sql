-- `anon` (quien llama con la clave pública sin iniciar sesión) deja de tener
-- privilegios de TABLA en `public`.
--
-- El default ACL de Supabase le dio a `anon` SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES, TRIGGER y MAINTAIN sobre 32 tablas. Hoy RLS no le deja
-- usar ninguno, pero es la única barrera: una policy futura escrita con un
-- descuido (por ejemplo `to public` sin filtro de tenant) dejaría esas tablas
-- abiertas a cualquiera. Con esta migración hacen falta dos errores, no uno.
--
-- Lo que `anon` necesita de verdad no cambia:
--   - properties, newsletter_editions y open_houses: SELECT POR COLUMNA para
--     las webs de clientes (047, 105, open houses). Revocar privilegios de
--     tabla que no son SELECT no toca esas columnas.
--   - tenants: /api/health consulta `select id` sin sesión (RLS le devuelve
--     cero filas). Basta SELECT sobre la columna id.
-- Las rutas públicas que escriben (intake, page views, vistas de newsletter)
-- usan el admin client. La API de agentes usa la clave pública con el JWT del
-- bot, así que entra como `authenticated`.
--
-- tests/schema/grants.test.ts falla si `anon` vuelve a tener privilegios de
-- tabla en alguna tabla de `public`.

revoke all on
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
  public.purchase_email_templates,
  public.purchase_processes,
  public.studio_images,
  public.studio_templates,
  public.subscriptions,
  public.tenant_quality_bands,
  public.tenants,
  public.user_profiles
from anon;

-- `revoke all` sobre la tabla también quitaría el SELECT por columna que leen
-- las webs: en properties sólo se revoca lo que no es SELECT.
revoke insert, update, delete, truncate, references, trigger, maintain
  on public.properties from anon;

grant select (id) on public.tenants to anon;
