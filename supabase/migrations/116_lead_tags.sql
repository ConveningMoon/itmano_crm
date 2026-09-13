-- 116 · Etiquetas de leads.
--
-- Una etiqueta es un HECHO QUE DECIDE UNA PERSONA sobre un lead: "lo contacté y
-- no contestó", "está pre-aprobado", "es de otro agente". Eso es otro eje que
-- todo lo que ya vive en `leads`:
--
--   · `stage` lo mueve el embudo (nuevo → nutrición → en proceso → cerrado).
--   · `quality_band` y `urgency` los calcula el modelo de scoring.
--   · `traffic_source` / `acquisition_channel_id` son la PROCEDENCIA del lead.
--
-- Ninguno de los tres puede expresar "ya le escribí y hay silencio", y por eso
-- la etiqueta no duplica nada: es la capa que el agente escribe a mano, y desde
-- la 117 también el disparador de las secuencias de email obligatorias.
--
-- Decisiones del modelo y por qué:
--
--   · CATÁLOGO + ASIGNACIÓN, no un `text[]` en `leads`. Con un array no se puede
--     renombrar una etiqueta sin reescribir filas, ni colgarle una secuencia por
--     id, ni darle color. El costo es un join que los índices de abajo cubren.
--
--   · LAS ETIQUETAS SON DEL TENANT, no personales como las carpetas de la 115.
--     Es la diferencia importante entre las dos features: una carpeta sólo
--     ordena la vista de quien la creó, mientras que una etiqueta dispara
--     automatización y sirve de supervisión compartida. Si cada agente tuviera
--     las suyas, "contactado sin respuesta" significaría una cosa distinta por
--     persona y la secuencia cubriría sólo a uno.
--
--   · NO SE ESCRIBE UN `lead_event` al etiquetar. El trigger de scoring
--     (010) actualiza `leads.last_event_at` en TODO insert de `lead_events`,
--     incluso cuando ninguna regla casa. Registrar ahí la etiqueta haría que
--     anotar "no contestó" marcara al lead como recién activo, subiendo su
--     urgencia justo cuando la verdad es la contraria. La fecha y el autor de la
--     etiqueta viven en la propia fila de asignación.

-- ── 1) Catálogo ──────────────────────────────────────────────────────────────

create table if not exists public.lead_tags (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references public.tenants(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  -- Identificador estable y legible. Es lo que viaja en la URL de /leads
  -- (?tag=contactado-sin-respuesta) y lo que hace idempotente el seed de abajo:
  -- el nombre se puede renombrar sin invalidar enlaces guardados.
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Hex de la paleta de la app (ver src/lib/leads/tags.ts). Se guarda el valor y
  -- no el nombre de la variable CSS porque `agents.accent_color` ya hace lo
  -- mismo y los chips de ambos se pintan igual.
  color       text not null default '#8A8A8A' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  description text check (char_length(description) <= 200),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.lead_tags is
  'Catálogo de etiquetas de leads, por tenant. Las etiquetas son compartidas por
   el equipo (a diferencia de las carpetas de la 115, que son personales):
   filtran la lista, sostienen la supervisión y desde la 117 disparan secuencias.';

-- Dos etiquetas con el mismo nombre son un error de dedo, no una intención.
create unique index if not exists lead_tags_tenant_name_idx
  on public.lead_tags (tenant_id, lower(btrim(name)));

create unique index if not exists lead_tags_tenant_slug_idx
  on public.lead_tags (tenant_id, slug);

create index if not exists lead_tags_tenant_position_idx
  on public.lead_tags (tenant_id, position, created_at);

-- ── 2) Asignación ────────────────────────────────────────────────────────────

create table if not exists public.lead_tag_assignments (
  lead_id     text not null references public.leads(id)      on delete cascade,
  tag_id      uuid not null references public.lead_tags(id)  on delete cascade,
  -- Redundante con leads.tenant_id, y a propósito: las policies de RLS y el
  -- filtro de la lista comparan por tenant sin subconsulta a `leads`.
  tenant_id   text not null references public.tenants(id)    on delete cascade,
  -- Quién etiquetó. auth.users y no agents.id: el actor es la identidad que
  -- entra a la app (misma convención que lead_events.actor_user_id), y el
  -- super_admin no tiene fila en `agents`.
  assigned_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (lead_id, tag_id)
);

comment on table public.lead_tag_assignments is
  'Qué etiquetas tiene cada lead. La PK evita duplicados, y su fecha es el
   registro de cuándo se etiquetó (no se escribe lead_event: ver cabecera).';

-- El filtro de /leads y el panel de una etiqueta van por tag_id.
create index if not exists lead_tag_assignments_tag_idx
  on public.lead_tag_assignments (tag_id, lead_id);

create index if not exists lead_tag_assignments_tenant_idx
  on public.lead_tag_assignments (tenant_id);

-- ── 3) RLS ───────────────────────────────────────────────────────────────────
-- Aislamiento por tenant, como el resto del repo. NO es el modelo de la 115:
-- aquí el super_admin sí debe ver y administrar el catálogo del tenant que está
-- operando, porque estas filas son del equipo y no de una persona.
-- `(select auth.uid())` va envuelto para evaluarse una vez por consulta.

alter table public.lead_tags            enable row level security;
alter table public.lead_tag_assignments enable row level security;

create policy "lead_tags_select" on public.lead_tags
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "lead_tags_insert" on public.lead_tags
  for insert with check (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "lead_tags_update" on public.lead_tags
  for update
  using      (is_super_admin() or tenant_id = get_my_tenant_id())
  with check (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "lead_tags_delete" on public.lead_tags
  for delete using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "lead_tag_assignments_select" on public.lead_tag_assignments
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

-- El insert pide algo más que el tenant de quien escribe: que ESE tenant sea
-- dueño del lead Y de la etiqueta. Sin los dos EXISTS, una agencia podía crear
-- una fila con su propio tenant_id apuntando al lead y a la etiqueta de otra —
-- invisible para la agencia dueña del lead, y para la que la escribió una fila
-- que referencia cosas que no puede ver. No es una fuga de datos, pero es una
-- fila que no describe nada, y la RLS no debería ser más débil que la
-- invariante que las Server Actions ya cumplen.
create policy "lead_tag_assignments_insert" on public.lead_tag_assignments
  for insert with check (
    (is_super_admin() or tenant_id = get_my_tenant_id())
    and exists (
      select 1 from public.lead_tags t
      where t.id = tag_id and t.tenant_id = lead_tag_assignments.tenant_id
    )
    and exists (
      select 1 from public.leads l
      where l.id = lead_id and l.tenant_id = lead_tag_assignments.tenant_id
    )
  );

create policy "lead_tag_assignments_delete" on public.lead_tag_assignments
  for delete using (is_super_admin() or tenant_id = get_my_tenant_id());

-- ── 4) Grants ────────────────────────────────────────────────────────────────
-- Nada para `anon`: las etiquetas son internas y no aparecen en ninguna página
-- pública. Una asignación no se edita, se crea o se borra.

revoke all on public.lead_tags            from anon;
revoke all on public.lead_tag_assignments from anon;

grant select, insert, update, delete on public.lead_tags            to authenticated, service_role;
grant select, insert, delete         on public.lead_tag_assignments to authenticated, service_role;

-- ── 5) updated_at ────────────────────────────────────────────────────────────

create or replace function public.touch_lead_tag()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lead_tags_touch on public.lead_tags;
create trigger lead_tags_touch
  before update on public.lead_tags
  for each row execute function public.touch_lead_tag();

-- ── 6) La vista de listado expone las etiquetas ──────────────────────────────
--
-- OJO: la vista se recrea ENTERA a partir de su definición viva (misma
-- advertencia que la 106: perder una columna aquí deja /leads sin cargar y sin
-- error en tsc). Lo único nuevo respecto a la 106 es `tag_ids`.
--
-- Se agrega como SUBCONSULTA ESCALAR y no como `left join lateral` a propósito:
-- una subconsulta escalar sólo se evalúa si la columna se referencia, así que los
-- `count(*)` de la cabecera de /leads (que piden `head: true`) no pagan nada. Y
-- por ser la condición más cara, el planificador la deja al final entre los
-- filtros: el filtro por etiqueta se aplica sobre lo que ya pasó tenant, agente
-- y etapa, no sobre la tabla entera.

drop view if exists public.leads_list;

create view public.leads_list
with (security_invoker = on) as
select
  l.id,
  l.tenant_id,
  l.agent_id,
  l.first_name,
  l.last_name,
  l.email,
  l.phone,
  l.language,
  l.lender,
  l.notes,
  l.created_at,
  l.updated_at,
  l.acquisition_channel_id,
  l.traffic_source,
  l.traffic_source_detail,
  l.peak_score,
  l.current_score,
  l.last_event_at,
  l.score_updated_at,
  l.metadata,
  l.fit_profile,
  l.fit_score,
  l.engagement_score,
  l.manual_score,
  l.email_blocked,
  l.email_blocked_reason,
  l.search_text,
  l.quality_score,
  l.last_signal_at,
  l.last_signal_type,
  l.stage,

  -- Procedencia: vino de otro CRM, no lo capto un canal de ITMANO.
  jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'imported') as is_imported,

  -- Procedencia: llego por el formulario de una newsletter y todavia no ha
  -- mostrado intencion. Se le quita la marca al graduarse.
  jsonb_exists(coalesce(l.metadata, '{}'::jsonb), 'newsletter_subscriber') as is_subscriber,

  case
    when coalesce(b.active_leads, 0) < 20 then
      case
        when coalesce(l.quality_score, 0) >= 80 then 'alta'
        when coalesce(l.quality_score, 0) >= 60 then 'media_alta'
        when coalesce(l.quality_score, 0) >= 35 then 'media'
        when coalesce(l.quality_score, 0) >= 15 then 'media_baja'
        else 'baja'
      end
    else
      case
        when coalesce(l.quality_score, 0) >= b.p80 then 'alta'
        when coalesce(l.quality_score, 0) >= b.p60 then 'media_alta'
        when coalesce(l.quality_score, 0) >= b.p40 then 'media'
        when coalesce(l.quality_score, 0) >= b.p20 then 'media_baja'
        else 'baja'
      end
  end as quality_band,

  case
    when l.stage not in ('nuevo','nutricion')                        then null
    when ai.fresh_when is not null                                   then ai.fresh_when
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 'hoy'
    when l.last_signal_at > now() - interval '7 days'                then 'esta_semana'
    else 'sin_apuro'
  end as urgency,

  case
    when l.stage not in ('nuevo','nutricion')                        then 9
    when ai.fresh_when = 'hoy'                                       then 0
    when ai.fresh_when = 'esta_semana'                               then 1
    when ai.fresh_when = 'sin_apuro'                                 then 2
    when l.last_signal_at > now() - interval '48 hours'
     and l.last_signal_type in ('email_replied','contact_us_question') then 0
    when l.last_signal_at > now() - interval '7 days'                then 1
    else 2
  end as urgency_rank,

  l.budget_amount,

  -- Etiquetas del lead (116). Vacío y no null cuando no tiene ninguna: así el
  -- filtro por etiqueta y el render de los chips no necesitan tratar el null.
  coalesce((
    select array_agg(a.tag_id order by a.created_at)
    from public.lead_tag_assignments a
    where a.lead_id = l.id
  ), '{}'::uuid[]) as tag_ids
from public.leads l
left join public.tenant_quality_bands b on b.tenant_id = l.tenant_id
left join lateral (
  select case
    when s.at_ts is null                                                  then null
    when s.w = 'hoy'         and s.at_ts > now() - interval '48 hours'    then 'hoy'
    when s.w = 'esta_semana' and s.at_ts > now() - interval '7 days'      then 'esta_semana'
    when s.w = 'sin_apuro'   and s.at_ts > now() - interval '7 days'      then 'sin_apuro'
  end as fresh_when
  from (
    select
      l.metadata #>> '{ai_fit,next_action_when}' as w,
      case when (l.metadata #>> '{ai_fit,at}') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
           then (l.metadata #>> '{ai_fit,at}')::timestamptz end as at_ts
  ) s
) ai on true;

revoke all on public.leads_list from anon;
grant select on public.leads_list to authenticated, service_role;

-- ── 7) Catálogo por defecto ──────────────────────────────────────────────────
--
-- Estas 14 etiquetas son CONFIGURACIÓN DE PRODUCTO, no identidad de un cliente:
-- describen situaciones genéricas de un equipo inmobiliario (financiamiento,
-- intención, estado de contacto) y ninguna nombra a un tenant, una marca ni una
-- zona. Cada tenant las renombra, cambia de color o borra las que no use.
--
-- La lista vive en una función y no en un INSERT suelto para que el alta de un
-- tenant nuevo (createTenant en /admin) llame a la misma fuente en vez de
-- duplicarla en TypeScript.
--
-- Deliberadamente NO hay etiqueta "Zillow": de dónde vino un lead es
-- PROCEDENCIA, y eso ya lo modelan `traffic_source` y `acquisition_channel_id`
-- — que son los que alimentan la analítica de calidad y conversión por fuente.
-- Una etiqueta lo dejaría filtrable pero invisible para esa analítica.
--
-- Tampoco hay "No molestar": un lead al que no se le debe escribir se marca con
-- `leads.email_blocked`, que es lo que de verdad frena los envíos. Una etiqueta
-- daría la apariencia de bloqueo sin bloquear nada.

create or replace function public.seed_default_lead_tags(p_tenant_id text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.lead_tags (tenant_id, name, slug, color, description, position)
  values
    (p_tenant_id, 'Contactado sin respuesta',    'contactado-sin-respuesta',    '#C97B6B',
     'Se le escribió o llamó y no ha contestado. Queda en supervisión.',            10),
    (p_tenant_id, 'Datos de contacto inválidos', 'datos-invalidos',              '#8A8A8A',
     'El email o el teléfono no existen o no corresponden al lead.',                20),
    (p_tenant_id, 'Pre-aprobado',                'pre-aprobado',                 '#6BA368',
     'Tiene carta de pre-aprobación vigente.',                                      30),
    (p_tenant_id, 'Pre-aprobación en trámite',   'pre-aprobacion-en-tramite',    '#C9A96E',
     'Está en proceso con un prestamista, sin carta todavía.',                      40),
    (p_tenant_id, 'Cash buyer',                  'cash-buyer',                   '#6BA368',
     'Compra sin financiamiento.',                                                  50),
    (p_tenant_id, 'Necesita lender',             'necesita-lender',              '#C9A96E',
     'Aún no tiene prestamista y necesita referencia.',                             60),
    (p_tenant_id, 'Comprador primera vivienda',  'comprador-primera-vivienda',   '#5B8EC9',
     'Primera compra: requiere acompañamiento y educación del proceso.',            70),
    (p_tenant_id, 'Inversionista',               'inversionista',                '#5B8EC9',
     'Compra por rendimiento, no para habitar.',                                    80),
    (p_tenant_id, 'Vendedor / listing',          'vendedor-listing',             '#9B72CF',
     'Quiere vender o listar una propiedad, no comprar.',                           90),
    (p_tenant_id, 'Renta',                       'renta',                        '#5AAFA0',
     'Busca alquilar.',                                                            100),
    (p_tenant_id, 'Relocation',                  'relocation',                   '#5AAFA0',
     'Se muda de ciudad o país; tiene fecha límite externa.',                      110),
    (p_tenant_id, 'Fuera de zona',               'fuera-de-zona',                '#8A8A8A',
     'Busca en un área que el equipo no atiende.',                                 120),
    (p_tenant_id, 'Cliente de otro agente',      'cliente-de-otro-agente',       '#8A8A8A',
     'Ya trabaja con un agente ajeno al equipo.',                                  130),
    (p_tenant_id, 'Nurture largo plazo',         'nurture-largo-plazo',          '#B87BA3',
     'Compra a más de seis meses. Mantener contacto, sin presión.',                140)
  on conflict (tenant_id, slug) do nothing;
$$;

comment on function public.seed_default_lead_tags(text) is
  'Catálogo de etiquetas por defecto de un tenant. Idempotente por (tenant, slug).
   La llama la 116 para los tenants existentes y createTenant para los nuevos.';

revoke all on function public.seed_default_lead_tags(text) from public, anon, authenticated;
grant execute on function public.seed_default_lead_tags(text) to service_role;

-- Aplicar a los tenants que ya existen.
do $$
declare t record;
begin
  for t in select id from public.tenants loop
    perform public.seed_default_lead_tags(t.id);
  end loop;
end;
$$;
