-- Open houses de una propiedad.
--
-- Un open house es un EVENTO con fecha que vive en una propiedad y que se repite:
-- la misma casa puede abrirse tres sábados seguidos. Por eso es su propia tabla
-- y no una fuente de `acquisition_channels`: una fuente es un canal permanente
-- de captación, y esto es una fecha con principio y fin.
--
-- Es también el PRIMER envío masivo del producto. Todo lo demás sale lead por
-- lead (una acción de alguien o el orquestador de secuencias). Aquí una
-- confirmación puede mandar cientos de correos, así que el modelo se diseña
-- alrededor de tres garantías:
--
--   · UN LEAD NO RECIBE DOS VECES EL MISMO CORREO. La lista de destinatarios se
--     congela en `open_house_email_recipients` con PK (email_id, lead_id); un
--     reintento o dos workers a la vez chocan con la PK, no con el buzón del
--     lead. Resend recibe además una Idempotency-Key por lote.
--
--   · NADA SALE SIN CONFIRMAR. Un open house nace en `draft`: no es público y
--     su correo no se despacha. Sólo `scheduled` (confirmado) publica la cuenta
--     regresiva y deja que el despachador tome el anuncio.
--
--   · UN CAMBIO DESPUÉS DE AVISAR SE AVISA. Reprogramar o cancelar cuando el
--     anuncio ya salió crea un correo `update` o `cancellation` dirigido sólo a
--     quien lo recibió (o confirmó asistencia). Nunca se suma gente nueva.
--
-- Todas las escrituras pasan por Server Actions con el admin client (mismo
-- modelo que `properties`, 042): RLS aquí es la defensa de lectura.

create extension if not exists btree_gist with schema extensions;

-- ── 1) El evento ─────────────────────────────────────────────────────────────

create table if not exists public.open_houses (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            text not null references public.tenants(id)    on delete cascade,
  property_id          uuid not null references public.properties(id) on delete cascade,
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  -- Zona IANA del lugar del evento. La hora se guarda en UTC; la zona decide
  -- cómo se ESCRIBE en el correo y en la web ("sábado 3 de mayo, 11:00").
  timezone             text not null check (char_length(timezone) between 1 and 64),
  -- Detalle público: estacionamiento, acceso, "toca el timbre". Sale en la web
  -- y en el correo; nunca notas internas.
  public_notes         text check (char_length(public_notes) <= 500),
  -- Idiomas en los que el equipo escribe los correos de ESTE open house (1..3).
  -- El lead recibe el suyo según resolveLeadEmailLanguage; si no está aquí, no
  -- recibe nada — mandar en otro idioma es peor que no mandar (misma regla 117).
  languages            text[] not null check (cardinality(languages) between 1 and 3),
  -- Audiencia del anuncio: leads con estas etiquetas. `any` = cualquiera de
  -- ellas; `all` = todas. Ids y no slugs: renombrar una etiqueta no debe
  -- cambiar a quién le llega.
  audience_tag_ids     uuid[] not null default '{}',
  audience_match       text not null default 'any' check (audience_match in ('any', 'all')),
  rsvp_enabled         boolean not null default true,
  status               text not null default 'draft'
                         check (status in ('draft', 'scheduled', 'cancelled')),
  -- Sube en cada reprogramación con aviso. El correo `update` guarda la
  -- revisión que anuncia y la web externa puede usarla para invalidar caché.
  revision             integer not null default 1,
  created_by_user_id   uuid references auth.users(id)   on delete set null,
  created_by_agent_id  text references public.agents(id) on delete set null,
  confirmed_at         timestamptz,
  confirmed_by_user_id uuid references auth.users(id) on delete set null,
  cancelled_at         timestamptz,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  cancel_reason        text check (char_length(cancel_reason) <= 300),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint open_houses_time_order check (ends_at > starts_at),
  constraint open_houses_max_length check (ends_at - starts_at <= interval '12 hours'),
  -- Conflicto de agenda: la misma propiedad no puede tener dos open houses
  -- vivos que se pisen. Uno cancelado libera su franja.
  constraint open_houses_no_overlap exclude using gist (
    property_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status <> 'cancelled')
);

comment on table public.open_houses is
  'Open houses de una propiedad (recurrentes). draft → scheduled → cancelled.
   Sólo scheduled es público y despacha correos. Ver docs/agents/domains.md.';

create index if not exists open_houses_property_idx
  on public.open_houses (property_id, starts_at desc);

create index if not exists open_houses_tenant_starts_idx
  on public.open_houses (tenant_id, starts_at);

-- ── 2) Correos programados ───────────────────────────────────────────────────
-- Uno por envío: el anuncio, el recordatorio (sólo a quien confirmó), y los
-- avisos de cambio o cancelación. Cada uno con su fecha de salida.

create table if not exists public.open_house_emails (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null references public.tenants(id)     on delete cascade,
  open_house_id   uuid not null references public.open_houses(id) on delete cascade,
  kind            text not null
                    check (kind in ('announcement', 'reminder', 'update', 'cancellation')),
  scheduled_at    timestamptz not null,
  -- pending   → espera su hora (y, salvo cancellation, que el evento esté scheduled)
  -- sending   → un despachador lo tomó; `started_at` sirve para recuperar uno caído
  -- sent      → terminó; los conteos describen el resultado
  -- cancelled → ya no aplica (evento cancelado, reprogramado, recordatorio apagado)
  -- failed    → no pudo salir; `last_error` dice por qué
  status          text not null default 'pending'
                    check (status in ('pending', 'sending', 'sent', 'cancelled', 'failed')),
  revision        integer not null default 1,
  recipients_frozen_at timestamptz,
  sent_count      integer not null default 0,
  skipped_count   integer not null default 0,
  failed_count    integer not null default 0,
  attempts        integer not null default 0,
  started_at      timestamptz,
  finished_at     timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.open_house_emails is
  'Correos de un open house. El orquestador despacha los pending cuya hora llegó.';

-- Un anuncio y un recordatorio por open house; avisos de cambio, los que hagan falta.
create unique index if not exists open_house_emails_single_kind_idx
  on public.open_house_emails (open_house_id, kind)
  where kind in ('announcement', 'reminder');

create index if not exists open_house_emails_open_house_idx
  on public.open_house_emails (open_house_id, created_at);

-- Lo que consulta el orquestador cada hora.
create index if not exists open_house_emails_due_idx
  on public.open_house_emails (scheduled_at)
  where status in ('pending', 'sending');

-- ── 3) Contenido por idioma ──────────────────────────────────────────────────
-- Igual que los correos de cierre: contenido del CRM (asunto + body_json del
-- composer) o un template de Resend. El contenido del CRM tiene precedencia.

create table if not exists public.open_house_email_contents (
  email_id           uuid not null references public.open_house_emails(id) on delete cascade,
  tenant_id          text not null references public.tenants(id) on delete cascade,
  language           text not null,
  subject            text check (char_length(subject) <= 200),
  body_json          jsonb,
  resend_template_id text check (char_length(resend_template_id) <= 200),
  updated_at         timestamptz not null default now(),
  primary key (email_id, language),
  constraint open_house_email_contents_has_content check (
    (subject is not null and body_json is not null) or resend_template_id is not null
  )
);

-- ── 4) Destinatarios congelados ──────────────────────────────────────────────

create table if not exists public.open_house_email_recipients (
  email_id        uuid not null references public.open_house_emails(id) on delete cascade,
  lead_id         text not null references public.leads(id) on delete cascade,
  tenant_id       text not null references public.tenants(id) on delete cascade,
  language        text,
  status          text not null default 'pending'
                    check (status in ('pending', 'sent', 'skipped', 'failed')),
  skip_reason     text,
  resend_email_id text,
  attempts        smallint not null default 0,
  last_error      text,
  sent_at         timestamptz,
  primary key (email_id, lead_id)
);

create index if not exists open_house_email_recipients_status_idx
  on public.open_house_email_recipients (email_id, status);

create index if not exists open_house_email_recipients_lead_idx
  on public.open_house_email_recipients (lead_id);

-- ── 5) RSVP ──────────────────────────────────────────────────────────────────
-- Una respuesta por lead y evento: responder otra vez la actualiza. `attended`
-- lo marca el agente después del evento.

create table if not exists public.open_house_rsvps (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      text not null references public.tenants(id)     on delete cascade,
  open_house_id  uuid not null references public.open_houses(id) on delete cascade,
  lead_id        text not null references public.leads(id)       on delete cascade,
  response       text not null check (response in ('yes', 'no')),
  guests         smallint not null default 0 check (guests between 0 and 10),
  source         text not null check (source in ('email', 'web', 'crm')),
  attended       boolean,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (open_house_id, lead_id)
);

create index if not exists open_house_rsvps_lead_idx
  on public.open_house_rsvps (lead_id);

-- Índices de FK que no cubre ninguno de arriba: un borrado en cascada de un
-- tenant o un set null al borrar un usuario no debe recorrer la tabla entera.
create index if not exists open_houses_created_by_user_idx      on public.open_houses (created_by_user_id);
create index if not exists open_houses_created_by_agent_idx     on public.open_houses (created_by_agent_id);
create index if not exists open_houses_confirmed_by_user_idx    on public.open_houses (confirmed_by_user_id);
create index if not exists open_houses_cancelled_by_user_idx    on public.open_houses (cancelled_by_user_id);
create index if not exists open_house_emails_tenant_idx         on public.open_house_emails (tenant_id);
create index if not exists open_house_email_contents_tenant_idx on public.open_house_email_contents (tenant_id);
create index if not exists open_house_email_recipients_tenant_idx on public.open_house_email_recipients (tenant_id);
create index if not exists open_house_rsvps_tenant_idx          on public.open_house_rsvps (tenant_id);

-- ── 6) email_sends: tipo y vínculo ───────────────────────────────────────────
-- Cada correo de open house deja su fila en email_sends para que el webhook de
-- Resend atribuya rebotes, quejas, clicks y respuestas al lead igual que en los
-- demás envíos. Sin esto, un rebote no bloquearía el email del lead.

alter table public.email_sends
  add column if not exists open_house_email_id uuid
    references public.open_house_emails(id) on delete set null;

create index if not exists email_sends_open_house_email_idx
  on public.email_sends (open_house_email_id)
  where open_house_email_id is not null;

do $$
declare
  vivos text[];
begin
  -- Guarda: el CHECK se reemplaza entero; no debe perder ningún valor en uso.
  select array_agg(distinct send_type) into vivos from public.email_sends;
  if vivos is not null and not vivos <@ array['sequence', 'purchase', 'one_off', 'open_house'] then
    raise exception 'email_sends.send_type tiene valores fuera del CHECK nuevo: %', vivos;
  end if;
end;
$$;

alter table public.email_sends drop constraint if exists email_sends_send_type_check;
alter table public.email_sends
  add constraint email_sends_send_type_check
  check (send_type in ('sequence', 'purchase', 'one_off', 'open_house'));

-- ── 7) updated_at ────────────────────────────────────────────────────────────

create or replace function public.touch_open_house_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists open_houses_touch on public.open_houses;
create trigger open_houses_touch before update on public.open_houses
  for each row execute function public.touch_open_house_row();

drop trigger if exists open_house_emails_touch on public.open_house_emails;
create trigger open_house_emails_touch before update on public.open_house_emails
  for each row execute function public.touch_open_house_row();

drop trigger if exists open_house_rsvps_touch on public.open_house_rsvps;
create trigger open_house_rsvps_touch before update on public.open_house_rsvps
  for each row execute function public.touch_open_house_row();

-- ── 8) RLS ───────────────────────────────────────────────────────────────────
-- Lectura por tenant para el CRM. Sin policies de escritura para
-- `authenticated`: las Server Actions escriben con el admin client después de
-- validar rol y tenant en código (mismo modelo que properties, 042).

alter table public.open_houses                 enable row level security;
alter table public.open_house_emails           enable row level security;
alter table public.open_house_email_contents   enable row level security;
alter table public.open_house_email_recipients enable row level security;
alter table public.open_house_rsvps            enable row level security;

drop policy if exists "open_houses_select" on public.open_houses;
create policy "open_houses_select" on public.open_houses
  for select to authenticated
  using (is_super_admin() or tenant_id = get_my_tenant_id());

drop policy if exists "open_house_emails_select" on public.open_house_emails;
create policy "open_house_emails_select" on public.open_house_emails
  for select to authenticated
  using (is_super_admin() or tenant_id = get_my_tenant_id());

drop policy if exists "open_house_email_contents_select" on public.open_house_email_contents;
create policy "open_house_email_contents_select" on public.open_house_email_contents
  for select to authenticated
  using (is_super_admin() or tenant_id = get_my_tenant_id());

drop policy if exists "open_house_email_recipients_select" on public.open_house_email_recipients;
create policy "open_house_email_recipients_select" on public.open_house_email_recipients
  for select to authenticated
  using (is_super_admin() or tenant_id = get_my_tenant_id());

drop policy if exists "open_house_rsvps_select" on public.open_house_rsvps;
create policy "open_house_rsvps_select" on public.open_house_rsvps
  for select to authenticated
  using (is_super_admin() or tenant_id = get_my_tenant_id());

-- Lectura pública para la web propia del cliente (cuenta regresiva). Sólo los
-- confirmados o cancelados de una propiedad publicada: un borrador no existe
-- para `anon`, y uno cancelado se ve para que la web diga "cancelado" en vez de
-- desaparecer sin explicación.
drop policy if exists "open_houses_public_select" on public.open_houses;
create policy "open_houses_public_select" on public.open_houses
  for select to anon
  using (
    status in ('scheduled', 'cancelled')
    and exists (
      select 1 from public.properties p
      where p.id = open_houses.property_id and p.published_to_web = true
    )
  );

-- ── 9) Grants ────────────────────────────────────────────────────────────────
-- `anon` lee por COLUMNA (mismo patrón que properties, 047): quién creó o
-- confirmó, la audiencia y el motivo de cancelación son internos.

revoke all on public.open_houses                 from anon;
revoke all on public.open_house_emails           from anon;
revoke all on public.open_house_email_contents   from anon;
revoke all on public.open_house_email_recipients from anon;
revoke all on public.open_house_rsvps            from anon;

grant select (
  id, tenant_id, property_id, starts_at, ends_at, timezone, public_notes,
  rsvp_enabled, status, revision, updated_at
) on public.open_houses to anon;

grant select on public.open_houses                 to authenticated;
grant select on public.open_house_emails           to authenticated;
grant select on public.open_house_email_contents   to authenticated;
grant select on public.open_house_email_recipients to authenticated;
grant select on public.open_house_rsvps            to authenticated;

grant all on public.open_houses                 to service_role;
grant all on public.open_house_emails           to service_role;
grant all on public.open_house_email_contents   to service_role;
grant all on public.open_house_email_recipients to service_role;
grant all on public.open_house_rsvps            to service_role;
