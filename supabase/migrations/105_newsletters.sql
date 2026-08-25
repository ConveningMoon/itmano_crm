-- 105 · Newsletters: contenido editorial con captación de suscriptores.
--
-- La serie ES un canal de adquisición (channel_type = 'newsletter'), no una
-- tabla nueva: así hereda email_sequence_id, hosted_page, agent_id y toda la
-- analítica de fuente sin escribir una línea. Lo editorial de la serie vive en
-- metadata/hosted_page, que ya es el patrón de las páginas alojadas.
--
-- Sólo las EDICIONES necesitan tabla propia.

-- ── 1) La serie como tipo de canal ───────────────────────────────────────────
alter table public.acquisition_channels
  drop constraint if exists acquisition_channels_channel_type_valid;
alter table public.acquisition_channels
  add constraint acquisition_channels_channel_type_valid
  check (channel_type = any (array[
    'lead_magnet', 'event', 'contact_form', 'manychat_flow', 'manual', 'newsletter'
  ]));

-- ── 2) Allowlist de fuentes del tenant (la usa el Plan 2, se crea ya) ────────
alter table public.tenants
  add column if not exists newsletter_source_domains text[];

comment on column public.tenants.newsletter_source_domains is
  'Dominios que la búsqueda web puede consultar como fuente al generar
   newsletters con IA. Máximo 64. null = ese tenant no puede generar con IA.';

-- ── 3) Ediciones ─────────────────────────────────────────────────────────────
create table if not exists public.newsletter_editions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            text not null references public.tenants(id) on delete cascade,
  channel_id           uuid not null references public.acquisition_channels(id) on delete cascade,
  slug                 text not null,
  title                text not null,
  dek                  text,
  language             text not null default 'es',
  translation_group_id uuid,
  -- Portada OBLIGATORIA por esquema, no por la UI: una edición sin portada no
  -- debe poder existir ni aunque alguien escriba directo en la base.
  cover_image_url      text not null,
  cover_source         text not null default 'upload'
                       check (cover_source in ('upload', 'studio', 'ai')),
  content              jsonb not null default '{"v":1,"blocks":[]}'::jsonb,
  sources              jsonb not null default '[]'::jsonb,
  data_as_of           date,
  status               text not null default 'draft'
                       check (status in ('draft', 'published', 'archived')),
  published_at         timestamptz,
  ai_generated         boolean not null default false,
  ai_run               jsonb,
  unpublished_by_billing boolean not null default false,
  created_by_agent_id  text references public.agents(id) on delete set null,
  created_by_user_id   uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint newsletter_editions_language_check check (language = any (array[
    'es','en','pt','fr','de','it','zh','ja','ko','ru','ar','hi','vi','tl','ht','pl','uk','tr','nl'
  ]))
);

create unique index if not exists newsletter_editions_channel_slug_idx
  on public.newsletter_editions (channel_id, slug);
create index if not exists newsletter_editions_tenant_status_idx
  on public.newsletter_editions (tenant_id, channel_id, status);
create index if not exists newsletter_editions_translation_idx
  on public.newsletter_editions (translation_group_id)
  where translation_group_id is not null;

-- ── 4) RLS ───────────────────────────────────────────────────────────────────
-- El repo no usa una policy `for all`: usa una policy por operación, como
-- acquisition_channels (003) — la misma tabla que esta migración extiende con
-- channel_type = 'newsletter'. `current_tenant_id()` no existe en este repo;
-- el resto de tablas resuelve el tenant con `is_super_admin() or tenant_id =
-- get_my_tenant_id()`, y esta tabla sigue exactamente esa forma.
alter table public.newsletter_editions enable row level security;

create policy "newsletter_editions_select" on public.newsletter_editions
  for select using (is_super_admin() or (tenant_id = get_my_tenant_id()));

create policy "newsletter_editions_insert" on public.newsletter_editions
  for insert with check (is_super_admin() or (tenant_id = get_my_tenant_id()));

create policy "newsletter_editions_update" on public.newsletter_editions
  for update
  using (is_super_admin() or (tenant_id = get_my_tenant_id()))
  with check (is_super_admin() or (tenant_id = get_my_tenant_id()));

create policy "newsletter_editions_delete" on public.newsletter_editions
  for delete using (is_super_admin() or (tenant_id = get_my_tenant_id()));

-- El público sólo ve lo publicado y no degradado por billing. Nombrada como
-- properties_public_select (045): esa es la convención del repo para la
-- policy de lectura anónima, no "_anon_read".
create policy "newsletter_editions_public_select" on public.newsletter_editions
  for select to anon
  using (status = 'published' and unpublished_by_billing = false);

-- ── 5) Grants por COLUMNA para anon ──────────────────────────────────────────
-- Mismo criterio que properties: la policy limita FILAS, los grants limitan
-- COLUMNAS. Consecuencia: el lector público debe pedir columnas explícitas —
-- un select('*') devuelve 401. Es intencional.
revoke all on public.newsletter_editions from anon;
grant select (
  id, tenant_id, channel_id, slug, title, dek, language, translation_group_id,
  cover_image_url, content, sources, data_as_of, status, published_at, created_at
) on public.newsletter_editions to anon;

grant select, insert, update, delete on public.newsletter_editions to authenticated, service_role;

-- ── 6) updated_at ────────────────────────────────────────────────────────────
create or replace function public.touch_newsletter_edition()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists newsletter_editions_touch on public.newsletter_editions;
create trigger newsletter_editions_touch
  before update on public.newsletter_editions
  for each row execute function public.touch_newsletter_edition();

-- ── 7) Bucket de medios ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('newsletter-media', 'newsletter-media', true)
on conflict (id) do nothing;
