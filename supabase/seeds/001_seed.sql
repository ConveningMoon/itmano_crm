-- Seed data for A&J Real Estate Group (tenant-aj)
-- Run once against a fresh schema. Safe to re-run only on empty tables.

-- ─── Tenant ──────────────────────────────────────────────────────────────────
insert into tenants (id, name, slug, primary_color) values
  ('tenant-aj', 'A&J Real Estate Group', 'aj-real-estate', '#C9A96E');

-- ─── Agents ──────────────────────────────────────────────────────────────────
insert into agents (id, tenant_id, name, email, phone, language, specialty, avatar_initials, accent_color) values
  ('agent-adriana', 'tenant-aj', 'Adriana Melendez',  'adriana@ajrealestate.com', '(305) 555-0101', 'es', 'hispanic',    'AM', '#5B8EC9'),
  ('agent-john',    'tenant-aj', 'John Leonard',      'john@ajrealestate.com',    '(305) 555-0102', 'en', 'military',    'JL', '#5AAFA0'),
  ('agent-melanie', 'tenant-aj', 'Melanie Valencia',  'melanie@ajrealestate.com', '(305) 555-0103', 'es', 'first_buyer', 'MV', '#C97B6B'),
  ('agent-viviane', 'tenant-aj', 'Viviane Chiu',      'viviane@ajrealestate.com', '(305) 555-0104', 'pt', 'brazilian',   'VC', '#B87BA3');

-- ─── Lead Sources ────────────────────────────────────────────────────────────
insert into lead_sources (id, tenant_id, name, type) values
  ('src-lm-guia',     'tenant-aj', 'Guía Familias Hispanas',       'lead_magnet'),
  ('src-lm-va',       'tenant-aj', 'VA Loan Guide',                'lead_magnet'),
  ('src-lm-firstbuy', 'tenant-aj', 'First Buyer Checklist',        'lead_magnet'),
  ('src-lm-br',       'tenant-aj', 'Guia Familias Brasileiras',    'lead_magnet'),
  ('src-web',         'tenant-aj', 'Web Form',                     'web_form'),
  ('src-oh',          'tenant-aj', 'Open House',                   'open_house'),
  ('src-manual',      'tenant-aj', 'Manual Entry',                 'manual'),
  ('src-ads',         'tenant-aj', 'Google Ads',                   'ads'),
  ('src-ref',         'tenant-aj', 'Referral',                     'referral');

-- ─── Lead Magnets ────────────────────────────────────────────────────────────
insert into lead_magnets (id, tenant_id, agent_id, title, subtitle, language, month_year, cover_emoji, page_url, active) values
  ('lm-guia-es', 'tenant-aj', 'agent-adriana', 'Guía para Familias Hispanas',    'Compra tu primera casa con confianza',      'es', 'Mayo 2025',  '🏡', '/lm/guia-familias-hispanas',    true),
  ('lm-va-en',   'tenant-aj', 'agent-john',    'VA Home Loan Guide',              'Everything veterans need to know',          'en', 'May 2025',   '🎖️', '/lm/va-loan-guide',             false),
  ('lm-fb-es',   'tenant-aj', 'agent-melanie', 'First Home Buyer Checklist',     'Step-by-step guide for first buyers',       'es', 'Abril 2025', '✅', '/lm/first-buyer-checklist',     false),
  ('lm-br-pt',   'tenant-aj', 'agent-viviane', 'Guia para Famílias Brasileiras', 'Compre sua casa nos EUA com segurança',     'pt', 'Maio 2025',  '🇧🇷', '/lm/guia-familias-brasileiras', false);

-- ─── Leads (20 rows) ─────────────────────────────────────────────────────────
insert into leads (id, tenant_id, agent_id, source_id, first_name, last_name, email, phone, language, status, temperature_score, lender, notes, created_at) values
  ('lead-001','tenant-aj','agent-adriana','src-lm-guia',    'Maria',    'Rodriguez', 'maria.r@email.com',    '(786)555-0001','es','new',               20, null,         null,                        now() - interval '2 days');
