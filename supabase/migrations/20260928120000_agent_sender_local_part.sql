-- Dirección de envío opcional por agente.
--
--   · agents.sender_local_part — parte local (lo que va antes de la @) con la
--     que el agente firma sus correos sobre el dominio verificado del equipo:
--     'melany' → melany@mail.ajrealestateva.com. NULL = se deriva sola de su
--     email (ver senderFromForAgent). No aplica en el dominio compartido de
--     ITMANO, donde la dirección identifica al tenant.
--   · Única por tenant: dos agentes con la misma dirección se confundirían en
--     las respuestas.

alter table public.agents
  add column if not exists sender_local_part text
    check (sender_local_part is null or sender_local_part ~ '^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$');

comment on column public.agents.sender_local_part is
  'Parte local de la dirección de envío del agente sobre el dominio del equipo. NULL = derivada de su email.';

create unique index if not exists agents_tenant_sender_local_part_key
  on public.agents (tenant_id, sender_local_part)
  where sender_local_part is not null;
