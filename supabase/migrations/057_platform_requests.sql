-- 057 · Solicitudes de plataforma (contacto de la landing + soporte del CRM).
--
-- Reemplaza el envío por email (CONTACT_FORM_TO / SUPPORT_FORM_FROM): las
-- solicitudes ahora se guardan en el CRM y el super_admin las gestiona desde
-- la página /solicitudes (tabs Contacto | Soporte) con checkbox de respondido.
-- El aviso inmediato sale por Telegram al chat del super_admin (server action,
-- no via pg_net: estas solicitudes no son "notifications" de tenant).
--
--   kind = 'contact' → formulario público de la landing (anónimo, tenant_id null)
--   kind = 'support' → soporte técnico del CRM y solicitud de más capacidad de
--                      IA (category = 'ai_capacity'), con tenant + usuario.

create table if not exists platform_requests (
  id              uuid        primary key default gen_random_uuid(),
  kind            text        not null check (kind in ('contact', 'support')),
  -- tenants.id es text en este esquema. null = solicitud anónima (landing).
  tenant_id       text        references tenants(id) on delete set null,
  tenant_name     text,       -- snapshot para no perder contexto si el tenant se borra
  requester_name  text,       -- landing: nombre del formulario
  requester_email text        not null,
  requester_role  text,       -- support: rol del usuario que escribe
  company         text,       -- landing: agencia/empresa
  category        text,       -- support: problema | pregunta | cambio | otro | ai_capacity
  subject         text,
  message         text        not null,
  -- Datos internos adjuntos (plan, uso de IA en USD, estimación...). Solo lo ve
  -- el super_admin — nunca superficies del tenant.
  metadata        jsonb       not null default '{}'::jsonb,
  responded       boolean     not null default false,
  responded_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_platform_requests_kind_created
  on platform_requests (kind, created_at desc);

alter table platform_requests enable row level security;

-- Solo ITMANO gestiona estas solicitudes. Escrituras vía service role (server
-- actions) — sin políticas de insert/update para roles autenticados.
create policy "platform_requests_select"
  on platform_requests for select
  using (is_super_admin());
