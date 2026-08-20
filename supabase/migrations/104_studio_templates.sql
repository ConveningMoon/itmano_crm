-- 104 · Las plantillas del Estudio pasan a ser filas.
--
-- Eran doce funciones TSX: cambiarlas exigía desplegar, y en Vercel no se puede
-- escribir en el sistema de archivos. Como filas, se editan desde el CRM.
--
-- Las CLAVES son las mismas de siempre (mosaico-listing, editorial-sold…):
-- studio_images.template ya las referencia, y renombrarlas rompería
-- "Recomponer" y "Variante" sobre lo ya publicado.
--
-- No lleva tenant_id: el catálogo es de ITMANO y lo escribe solo el super_admin
-- (decisión de autor único). Si algún día un tenant diseña lo suyo, la columna
-- se añade entonces y la policy pasa a mirarla.

create table if not exists studio_templates (
  key          text primary key,
  label        text not null,
  hint         text not null default '',
  recipes      text[] not null default '{}',
  aspects      text[] not null default '{4:5}',
  html         text not null default '',
  css          text not null default '',
  -- Inferidos del html al guardar: {"required": [...], "optional": [...]}
  slots        jsonb not null default '{"required": [], "optional": []}'::jsonb,
  ideal_photos integer not null default 0,
  thumb_path   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table studio_templates is
  'Diseños del Estudio en HTML/CSS. Se renderizan con Chrome; las escribe solo el super_admin.';
comment on column studio_templates.slots is
  'Inferido del html al guardar. No se edita a mano: la fuente de verdad es el html.';

-- ── RLS: lectura para cualquier usuario autenticado, escritura por service role.
-- El catálogo no es secreto —el selector de diseños lo enseña— pero editarlo es
-- de ITMANO, y las escrituras pasan todas por el cliente admin.
alter table studio_templates enable row level security;

drop policy if exists "studio_templates_select" on studio_templates;
create policy "studio_templates_select"
  on studio_templates for select
  using (auth.role() = 'authenticated');

-- ── El diseño con el que se hizo cada pieza ──────────────────────────────────
-- Recomponer existe para arreglar un texto, no para redibujar la pieza con el
-- diseño de hoy: sin esto, corregir un precio devolvería algo distinto a lo que
-- el tenant ya publicó. Mismo criterio que form_json, que ya guarda el
-- formulario entero.
alter table studio_images
  add column if not exists template_snapshot jsonb;

comment on column studio_images.template_snapshot is
  'El {html, css} usado al generar. Recomponer repinta con esto; Variante usa el diseño vivo.';
