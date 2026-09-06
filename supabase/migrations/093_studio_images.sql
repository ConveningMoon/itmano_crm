-- 093 · Estudio: generador de imágenes de marketing (fase de prueba, solo
-- super_admin). Una fila por imagen producida, con el formulario que la originó.
--
-- El trabajo está partido en dos mitades que nunca se mezclan: el modelo produce
-- LA ESCENA (una foto sin texto) y sharp produce EL DISEÑO (tipografía, precio,
-- fecha, marca). Por eso conviven aquí `scene_prompt` (lo que se le pidió al
-- modelo) y `form_json` (los datos exactos que se compusieron encima).
--
-- Convenciones del CRM respetadas:
--   · tenants.id y agents.id son TEXT; properties.id es UUID.
--   · RLS de lectura por tenant con get_my_tenant_id(), igual que properties.
--     Las escrituras pasan solo por el service-role client (server actions), así
--     que no hay políticas de insert/update para roles autenticados.
--   · Bucket público servido por URL, como carousel-assets (045) y
--     property-media: el destino de estas piezas es una red social.

create table if not exists studio_images (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       text        not null references tenants(id)   on delete cascade,
  -- El agente que APARECE en la pieza (el del formulario), no quien la generó.
  -- Quien la generó vive en created_by; el costo se atribuye en ai_usage_events.
  agent_id        text        references agents(id)             on delete set null,
  created_by      uuid        references auth.users(id)         on delete set null,
  recipe          text        not null check (recipe in
                                ('open_house','new_listing','sold','event','open_prompt')),
  -- on delete set null: borrar una propiedad no borra la pieza ya producida.
  property_id     uuid        references properties(id)         on delete set null,
  -- Snapshot autodescriptivo del formulario (incluye scene_notes). Mismo
  -- criterio que form_submissions: cada receta tiene campos distintos y no
  -- queremos una migración por cada ajuste del formulario. Es columna solo
  -- aquello por lo que se filtra, se ordena o se cobra.
  form_json       jsonb       not null,
  -- 'photo' no llama a ninguna IA: la foto real de la propiedad es el fondo,
  -- cuesta cero y muestra la casa que el comprador va a ver.
  source_mode     text        not null default 'generate'
                              check (source_mode in ('generate','photo')),
  style           text        not null,
  palette         text[],
  aspect          text        not null check (aspect in ('1:1','4:5','9:16')),
  reference_path  text,
  -- Qué significa la imagen de referencia. Decide los límites de transformación
  -- que se le imponen al modelo; sin esto el prompt es un deseo, no una
  -- instrucción: el modelo no puede saber si esa foto es la casa que debe
  -- respetar, el clima que debe copiar o el encuadre que debe repetir.
  reference_role  text        check (reference_role in ('subject','style','composition')),
  scene_prompt    text,
  -- Dónde quedó el espacio limpio. Es la unión entre los dos pasos: el director
  -- lo declara y el compositor escribe justo ahí.
  text_zone       text        check (text_zone in ('top','bottom','left')),
  background_path text,
  rendered_path   text,
  status          text        not null default 'pending' check (status in
                                ('pending','generating','composing','ready','failed')),
  error_message   text,
  cost_usd        numeric(12,6) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_studio_images_tenant_created
  on studio_images (tenant_id, created_at desc);

-- ── RLS: lectura por tenant. Escrituras vía service role. ────────────────────
-- La policy se escribe ya pensando en tenants aunque hoy no entren: es lo que
-- permite abrir la puerta cambiando solo canUseStudio(), sin tocar el esquema.
alter table studio_images enable row level security;

create policy "studio_images_select"
  on studio_images for select
  using (is_super_admin() or tenant_id = get_my_tenant_id());

-- ── Bucket público para los assets ───────────────────────────────────────────
-- Estructura: <tenant_id>/<image_id>/{ref,bg,final}.png
insert into storage.buckets (id, name, public)
values ('studio-images', 'studio-images', true)
on conflict (id) do nothing;
