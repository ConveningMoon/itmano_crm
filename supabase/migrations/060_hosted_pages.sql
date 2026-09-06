-- 060 · Páginas alojadas por ITMANO (hosted pages) para canales de adquisición.
--
-- Opción por defecto para tenants nuevos: en lugar de que el cliente construya
-- su landing page fuera (Webflow/Wix), el CRM aloja la página del canal en
-- subdominios de ITMANO y el tenant la configura desde /sources (constructor):
--   lead_magnet  → https://lm.itmano.com/<tenant-slug>/<canal-slug>
--   event        → https://events.itmano.com/<tenant-slug>/<canal-slug>
--   contact_form → https://forms.itmano.com/<tenant-slug>/<canal-slug>
-- y el catálogo de propiedades publicadas:
--   properties   → https://properties.itmano.com/<tenant-slug>
--
-- URLs únicas por construcción: tenants.slug es único y (tenant_id, slug) es
-- único en acquisition_channels. El routing por subdominio lo hace src/proxy.ts
-- (rewrite de host → /hp/... y /web/...).
--
-- hosted_page (jsonb, validado con zod en src/lib/hosted-page.ts):
--   { enabled, language, headline, subheadline, bullets[], cta_label,
--     success_message, ask_phone, questions: [{key,label,type,options,required}] }
-- null = página no configurada (el canal sigue funcionando por intake externo).

alter table acquisition_channels
  add column if not exists hosted_page jsonb;
