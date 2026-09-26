-- Zona horaria del negocio y remitente de los open houses.
--
--   · tenants.timezone — zona IANA de la zona PRINCIPAL donde trabaja la
--     agencia (perfil de negocio). Es la hora por defecto de un open house:
--     la del navegador de quien lo crea no sirve (el agente puede estar de
--     viaje, y el propio equipo puede operar desde otro huso). NULL = sin
--     configurar; la app la deduce de `primary_areas` mientras tanto.
--
--   · open_houses.sender_agent_id — a nombre de qué agente salen TODOS los
--     correos de un open house (nombre del remitente, firma y respuestas).
--     NULL = cada lead lo recibe de su propio agente, que es quien lo atiende.
--     `on delete set null`: si el agente se borra, el open house vuelve al
--     modo por lead en vez de quedar sin remitente.

alter table public.tenants
  add column if not exists timezone text
    check (timezone is null or char_length(timezone) between 1 and 64);

comment on column public.tenants.timezone is
  'Zona IANA de la zona principal del negocio (p. ej. America/New_York). Hora por defecto de los open houses.';

alter table public.open_houses
  add column if not exists sender_agent_id text
    references public.agents(id) on delete set null;

comment on column public.open_houses.sender_agent_id is
  'Agente a cuyo nombre salen los correos. NULL = el agente de cada lead.';

create index if not exists open_houses_sender_agent_idx
  on public.open_houses (sender_agent_id);
