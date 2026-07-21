-- 065 · Carousel Engine (fase de prueba, solo super_admin).
--
-- Motor que genera carruseles de Instagram completos (tema → copy → imágenes →
-- slides compuestos) para agentes de un tenant. Hoy: un solo agente activo
-- (Adriana / @adrysofi_realestate), visible SOLO para super_admin, ejecución
-- mono-usuario. El diseño ya incluye agent_id + tenant_id desde el día uno para
-- que abrir a multi-tenant sea activar RLS, no una migración de esquema.
--
-- Convenciones del CRM respetadas:
--   · tenants.id / agents.id son TEXT en este esquema (no uuid).
--   · RLS: enable + policy `using (is_super_admin())`. Las escrituras pasan solo
--     por el service-role client (server actions), así que no hay políticas de
--     insert/update para roles autenticados (igual que platform_requests, 057).
--   · Bucket público servido por URL, escrituras vía service role (igual que
--     property-media 045 y tenant-assets 049).

-- ── Perfil de marca por agente ───────────────────────────────────────────────
-- La identidad de marca (handle de Instagram, nombre de la agencia, mercado,
-- voz) es DATO, no código — así el footer @handle y el contexto de marca nunca
-- se hardcodean en componentes compartidos (Hard Rule #4). Las reglas del
-- sistema de diseño v2 (paleta, tipografía, layout) sí viven en código: son el
-- producto, no datos del tenant.
create table if not exists carousel_brand_profiles (
  agent_id         text        primary key references agents(id) on delete cascade,
  tenant_id        text        not null references tenants(id) on delete cascade,
  display_name     text        not null,
  instagram_handle text        not null,          -- '@adrysofi_realestate' (footer de todos los slides)
  agency_name      text,                          -- 'A&J Real Estate Group' (solo portada + cierre)
  market           text,                          -- 'Virginia & North Carolina'
  language         text        not null default 'es',
  -- Contexto de voz de marca inyectado en el prompt de copy (family-first,
  -- bilingüe, cálido, sin venta agresiva). Editable sin tocar código.
  brand_voice      text,
  active           boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Jobs de generación ───────────────────────────────────────────────────────
create table if not exists carousel_jobs (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     text        not null references tenants(id) on delete cascade,
  agent_id      text        not null references agents(id) on delete cascade,
  topic         text,                             -- null si lo eligió la IA por tendencias
  topic_source  text        not null default 'trend_research'
                            check (topic_source in ('manual', 'trend_research')),
  audience      text,                             -- audiencia específica elegida para este carrusel
  status        text        not null default 'pending'
                            check (status in ('pending','researching','writing_copy','generating_images','composing','ready','failed')),
  copy_json     jsonb,                            -- output estructurado de Claude por slide
  research_json jsonb,                            -- tendencias/fuentes encontradas (Gemini grounding)
  caption       text,                             -- texto para publicar (fuera de la imagen)
  hashtags      text[],                           -- exactamente 5
  error_message text,
  created_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_carousel_jobs_agent_created
  on carousel_jobs (agent_id, created_at desc);

-- ── Slides ───────────────────────────────────────────────────────────────────
create table if not exists carousel_slides (
  id                     uuid        primary key default gen_random_uuid(),
  job_id                 uuid        not null references carousel_jobs(id) on delete cascade,
  slide_number           int         not null,
  slide_type             text        check (slide_type in ('cover','data','emotional','text','cta')),
  copy_label             text,       -- gancho pequeño dorado (arriba)
  copy_title             text,       -- título grande dominante (navy)
  copy_subtitle          text,       -- apoyo/subtítulo mediano
  copy_lines             text[],     -- slide de 3 líneas de impacto
  icon                   text,       -- clave de ícono de línea (data slides), null = sin ícono
  image_source           text        check (image_source in ('nano_banana','procedural')),
  image_prompt           text,       -- prompt exacto usado si la imagen fue generada
  image_storage_path     text,       -- fondo (Nano Banana) en el bucket
  rendered_storage_path  text,       -- PNG final ya compuesto con texto
  status                 text        not null default 'pending'
                                     check (status in ('pending','rendering','ready','failed')),
  error_message          text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (job_id, slide_number)
);

create index if not exists idx_carousel_slides_job
  on carousel_slides (job_id, slide_number);

-- ── RLS: solo ITMANO (super_admin) lee. Escrituras vía service role. ──────────
alter table carousel_brand_profiles enable row level security;
alter table carousel_jobs           enable row level security;
alter table carousel_slides         enable row level security;

create policy "carousel_brand_profiles_select"
  on carousel_brand_profiles for select using (is_super_admin());
create policy "carousel_jobs_select"
  on carousel_jobs for select using (is_super_admin());
create policy "carousel_slides_select"
  on carousel_slides for select using (is_super_admin());

-- ── Bucket público para los assets (fondos + PNG renderizados) ───────────────
-- Estructura: <agent_id>/<job_id>/bg-<n>.png y <agent_id>/<job_id>/slide-<n>.png
-- Destino final: Instagram (contenido público), así que lectura por URL pública
-- como property-media. Escrituras solo por service role.
insert into storage.buckets (id, name, public)
values ('carousel-assets', 'carousel-assets', true)
on conflict (id) do nothing;

-- ── Seed: perfil de marca de Adriana (A&J) ───────────────────────────────────
-- Insert...select desde agents: si el agente semilla no existe (otro entorno),
-- el seed simplemente no inserta nada — nunca hardcodea el tenant en código.
insert into carousel_brand_profiles
  (agent_id, tenant_id, display_name, instagram_handle, agency_name, market, language, brand_voice)
select
  a.id,
  a.tenant_id,
  'Adriana Melendez',
  '@adrysofi_realestate',
  'A&J Real Estate Group',
  'Virginia & North Carolina',
  'es',
  'Adriana Melendez es agente bilingüe de bienes raíces en Virginia y North Carolina, con foco en la comunidad hispana/latina. Tono cálido, experto, familiar y bilingüe, sin lenguaje de venta agresivo — cada mensaje debe sentirse como el consejo de alguien de confianza, no una campaña publicitaria. Enfoque family-first: proteger a la familia, construir patrimonio, comprar con estrategia.'
from agents a
where a.id = 'agent-adriana'
on conflict (agent_id) do nothing;
