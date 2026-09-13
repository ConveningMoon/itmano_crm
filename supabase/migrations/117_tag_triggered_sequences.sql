-- 117 · Secuencias de email disparadas por una etiqueta.
--
-- Hasta ahora una secuencia se activaba de dos formas (024): `form` (el lead
-- envía el formulario de un canal) o `manual` (alguien la inscribe a mano). Este
-- es el tercer disparador: `tag`. Al poner una etiqueta a un lead, el lead entra
-- en la secuencia de ESA etiqueta EN SU IDIOMA.
--
-- Es el mismo patrón que los correos de hitos del proceso de compra (036/058):
-- correos obligatorios, uno por idioma, que salen de un hecho del CRM y no de
-- una campaña que alguien decide mandar. La diferencia es que aquí el contenido
-- vive en `email_sequences` + `email_sequence_steps` en vez de una tabla de
-- plantillas propia, y así se reutilizan el orquestador horario, las métricas,
-- la baja (List-Unsubscribe) y la cancelación al responder.
--
-- Decisiones y por qué:
--
--   · UNA SECUENCIA POR (ETIQUETA, IDIOMA). `email_sequences.language` ya
--     existía; el índice único de abajo la vuelve la clave del par. El lead
--     recibe la versión de su idioma resuelta con la MISMA regla que los correos
--     de cierre (resolveLeadEmailLanguage): su idioma si el agente lo atiende,
--     inglés si no. Si esa versión no existe, la etiqueta se pone igual y NO se
--     manda nada — mandar en otro idioma sería peor que no mandar, y el panel de
--     /emails muestra el hueco.
--
--   · `requires_sequence` EN EL CATÁLOGO, no una lista en el código. No todas
--     las etiquetas mandan correos: "pre-aprobado" describe al lead y no dispara
--     nada. Cuáles sí es una decisión del tenant, así que es un dato.
--
--   · `on delete restrict` EN trigger_tag_id. Con `cascade`, borrar una etiqueta
--     se llevaría la secuencia y su contenido; con `set null` quedaría una
--     secuencia de tipo `tag` sin etiqueta, que el CHECK de coherencia prohíbe.
--     Restringir obliga a desenganchar primero, que es la decisión real.
--
--   · QUITAR LA ETIQUETA CANCELA la corrida activa ('tag_removed'). Sin esto, el
--     lead seguiría recibiendo los pasos siguientes de una etiqueta que ya no
--     tiene — el fallo más obvio y el más difícil de explicar.

-- ── 1) Qué etiquetas exigen secuencia ────────────────────────────────────────

alter table public.lead_tags
  add column if not exists requires_sequence boolean not null default false;

comment on column public.lead_tags.requires_sequence is
  'true = esta etiqueta debe tener una secuencia por cada idioma que atiende el
   equipo. El panel "Por etiqueta" de /emails muestra los huecos.';

-- Las cuatro del catálogo por defecto que sí mandan correos. El resto describen
-- al lead (financiamiento, intención) y no disparan nada.
update public.lead_tags
set    requires_sequence = true
where  slug in (
  'contactado-sin-respuesta',
  'fuera-de-zona',
  'cliente-de-otro-agente',
  'nurture-largo-plazo'
);

-- ── 2) Tercer tipo de activación ─────────────────────────────────────────────

alter table public.email_sequences
  add column if not exists trigger_tag_id uuid references public.lead_tags(id) on delete restrict;

comment on column public.email_sequences.trigger_tag_id is
  'Etiqueta que dispara esta secuencia (sólo con activation_type = ''tag'').';

alter table public.email_sequences
  drop constraint if exists email_sequences_activation_type_check;

alter table public.email_sequences
  add constraint email_sequences_activation_type_check
  check (activation_type in ('form', 'manual', 'tag'));

-- Coherencia en los dos sentidos: una secuencia de etiqueta sin etiqueta no se
-- puede disparar, y una etiqueta colgada de una secuencia `form` o `manual` no
-- se dispararía nunca — las dos son estados que sólo confunden.
alter table public.email_sequences
  drop constraint if exists email_sequences_trigger_tag_coherence;

alter table public.email_sequences
  add constraint email_sequences_trigger_tag_coherence
  check ((activation_type = 'tag') = (trigger_tag_id is not null));

-- Una etiqueta, un idioma, una secuencia. Sin esto, dos secuencias de la misma
-- etiqueta en español harían que el lead recibiera dos correos por etiquetarlo.
create unique index if not exists email_sequences_tag_language_uq
  on public.email_sequences (tenant_id, trigger_tag_id, language)
  where trigger_tag_id is not null;

-- El disparo busca por (etiqueta, idioma, activa).
create index if not exists email_sequences_trigger_tag_idx
  on public.email_sequences (trigger_tag_id)
  where trigger_tag_id is not null;

-- ── 3) Motivo de cancelación ─────────────────────────────────────────────────
--
-- El CHECK se reemplaza entero, así que la lista de abajo es la VIVA (leída del
-- esquema, no de la 023: la 039 y la 050 le fueron sumando motivos) más el
-- nuevo. Escribir aquí sólo los de la 023 habría borrado en silencio siete
-- motivos que el orquestador ya usa.

alter table public.lead_sequence_runs
  drop constraint if exists lead_sequence_runs_cancelled_reason_check;

alter table public.lead_sequence_runs
  add constraint lead_sequence_runs_cancelled_reason_check
  check (
    cancelled_reason is null or
    cancelled_reason = any (array[
      'unsubscribed', 'replied', 'lead_closed', 'manual', 'sequence_deleted',
      'hard_bounce', 'spam_complaint', 'email_blocked', 'no_step', 'no_template',
      'no_content', 'no_from_address', 'resend_error',
      -- 117: se quitó la etiqueta que la había disparado.
      'tag_removed'
    ])
  );

-- ── 4) El catálogo por defecto ya nace con la marca ──────────────────────────
-- Se reemplaza la función de la 116 para que un tenant nuevo no tenga que
-- arreglar a mano cuáles etiquetas mandan correos.

create or replace function public.seed_default_lead_tags(p_tenant_id text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.lead_tags (tenant_id, name, slug, color, description, position, requires_sequence)
  values
    (p_tenant_id, 'Contactado sin respuesta',    'contactado-sin-respuesta',    '#C97B6B',
     'Se le escribió o llamó y no ha contestado. Queda en supervisión.',            10, true),
    (p_tenant_id, 'Datos de contacto inválidos', 'datos-invalidos',              '#8A8A8A',
     'El email o el teléfono no existen o no corresponden al lead.',                20, false),
    (p_tenant_id, 'Pre-aprobado',                'pre-aprobado',                 '#6BA368',
     'Tiene carta de pre-aprobación vigente.',                                      30, false),
    (p_tenant_id, 'Pre-aprobación en trámite',   'pre-aprobacion-en-tramite',    '#C9A96E',
     'Está en proceso con un prestamista, sin carta todavía.',                      40, false),
    (p_tenant_id, 'Cash buyer',                  'cash-buyer',                   '#6BA368',
     'Compra sin financiamiento.',                                                  50, false),
    (p_tenant_id, 'Necesita lender',             'necesita-lender',              '#C9A96E',
     'Aún no tiene prestamista y necesita referencia.',                             60, false),
    (p_tenant_id, 'Comprador primera vivienda',  'comprador-primera-vivienda',   '#5B8EC9',
     'Primera compra: requiere acompañamiento y educación del proceso.',            70, false),
    (p_tenant_id, 'Inversionista',               'inversionista',                '#5B8EC9',
     'Compra por rendimiento, no para habitar.',                                    80, false),
    (p_tenant_id, 'Vendedor / listing',          'vendedor-listing',             '#9B72CF',
     'Quiere vender o listar una propiedad, no comprar.',                           90, false),
    (p_tenant_id, 'Renta',                       'renta',                        '#5AAFA0',
     'Busca alquilar.',                                                            100, false),
    (p_tenant_id, 'Relocation',                  'relocation',                   '#5AAFA0',
     'Se muda de ciudad o país; tiene fecha límite externa.',                      110, false),
    (p_tenant_id, 'Fuera de zona',               'fuera-de-zona',                '#8A8A8A',
     'Busca en un área que el equipo no atiende.',                                 120, true),
    (p_tenant_id, 'Cliente de otro agente',      'cliente-de-otro-agente',       '#8A8A8A',
     'Ya trabaja con un agente ajeno al equipo.',                                  130, true),
    (p_tenant_id, 'Nurture largo plazo',         'nurture-largo-plazo',          '#B87BA3',
     'Compra a más de seis meses. Mantener contacto, sin presión.',                140, true)
  on conflict (tenant_id, slug) do nothing;
$$;

revoke all on function public.seed_default_lead_tags(text) from public, anon, authenticated;
grant execute on function public.seed_default_lead_tags(text) to service_role;
