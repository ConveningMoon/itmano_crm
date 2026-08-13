-- Datos de prueba para el SANDBOX. Nunca aplicar a produccion.
--
-- El tenant Test copiado de produccion trae un solo lead, y con uno no se puede
-- probar nada: los quintiles de calidad necesitan 20 leads activos para siquiera
-- activarse, el pipeline se ve vacio y analytics no tiene serie temporal. Esto
-- siembra 45 leads ficticios sobre ese mismo tenant.
--
-- Todos los correos son @example.com (dominio reservado por la RFC 2606). Es
-- deliberado: si alguna vez se dispara una secuencia desde el sandbox, no puede
-- salir correo hacia una persona real.
--
-- Los scores NO se escriben a mano: se insertan los eventos y el trigger de
-- scoring los calcula, que es justo lo que interesa poder probar.

-- OJO con los usuarios de auth: si los creas con rls_test_create_user (helper de
-- la 008), quedan con instance_id y los campos de token en NULL. Sirven para los
-- tests RLS —que solo mintean un JWT— pero NO para iniciar sesion: GoTrue lee
-- esas columnas como texto no-nulo, falla al leer la fila, intenta crear el
-- usuario de nuevo y choca con el email unico ("Database error saving new
-- user"). El bloque del final de este archivo los deja utilizables.
--
-- ── Guarda ────────────────────────────────────────────────────────────────────
-- Si esto corre por error contra produccion, aborta antes de escribir nada.
do $$
begin
  if exists (select 1 from tenants where slug = 'aj-real-estate') then
    raise exception 'ABORTADO: este seed es solo para el sandbox y se detecto el tenant de produccion (aj-real-estate)';
  end if;
  if not exists (select 1 from tenants where id = 'tenant-tenant-test') then
    raise exception 'ABORTADO: falta el tenant tenant-tenant-test; copialo antes de sembrar';
  end if;
end $$;

-- ── Agentes ───────────────────────────────────────────────────────────────────
-- Sin user_id: son miembros del equipo, no usuarios de login. Es el caso normal
-- del modelo (agents.user_id es nullable y casi siempre null).
insert into agents (id, tenant_id, name, email, language, languages, avatar_initials, accent_color, active)
values
  ('agent-ana-torres', 'tenant-tenant-test', 'Ana Torres', 'ana.torres@example.com', 'es', array['es','en'], 'AT', '#C97B5B', true),
  ('agent-luis-prado', 'tenant-tenant-test', 'Luis Prado', 'luis.prado@example.com', 'en', array['en'],      'LP', '#5BA88A', true)
on conflict (id) do nothing;

-- ── Leads ─────────────────────────────────────────────────────────────────────
with gen as (
  select
    i,
    ('11111111-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as lead_id,
    (array['Sofia','Mateo','Valeria','Diego','Camila','Andres','Lucia','Javier','Elena','Tomas',
           'Carmen','Bruno','Paula','Hugo','Marina'])[1 + (i % 15)] as nombre,
    (array['Reyes','Navarro','Castillo','Herrera','Vega','Molina','Cordero','Pineda','Salas','Bermudez',
           'Quintana','Arroyo','Lozano','Cabrera','Nunez'])[1 + (i % 15)] as apellido,
    (array['nuevo','nuevo','nuevo','nutricion','nutricion','nutricion','en_proceso','en_proceso','cerrado','perdido'])[1 + (i % 10)] as etapa,
    (array['under_3_months','3_6_months','6_12_months','over_12_explorando'])[1 + (i % 4)] as timeline,
    (array['cash','preapproved','in_process','not_started'])[1 + ((i + 1) % 4)] as financing,
    (array['premium','mid','entry','undefined'])[1 + ((i + 2) % 4)] as budget_tier,
    (array['sin_agente','con_agente'])[1 + (i % 2)] as agent_status,
    (array['zona_principal','zona_secundaria','fuera_de_zona'])[1 + (i % 3)] as geo_fit,
    (array['agent-dylan-owner','agent-ana-torres','agent-luis-prado'])[1 + (i % 3)] as agente,
    (array['cb37f953-8ee1-42eb-b165-673c6db6cc83','7f459d0b-e5e6-410d-8adb-77dd6b030c1e',
           '1b37aced-c9ef-4ee7-8a32-47145718b3d5','e5990cea-3d59-426f-b3d1-23bb9e4e04ec'])[1 + (i % 4)]::uuid as canal,
    (array['ads_meta','ads_google','organic_social','direct','referral','instagram'])[1 + (i % 6)] as fuente,
    (array['es','es','en'])[1 + (i % 3)] as idioma,
    -- Repartidos en ~100 dias hacia atras para que analytics tenga serie.
    now() - make_interval(days => (i * 2) % 100, hours => (i * 7) % 24) as alta
  from generate_series(1, 45) i
)
insert into leads (
  id, tenant_id, agent_id, first_name, last_name, email, phone, language,
  created_at, updated_at, acquisition_channel_id, traffic_source, stage, fit_profile, metadata
)
select
  g.lead_id,
  'tenant-tenant-test',
  g.agente,
  g.nombre,
  g.apellido,
  'lead' || g.i || '@example.com',
  '+1757555' || lpad(g.i::text, 4, '0'),
  g.idioma,
  g.alta,
  g.alta,
  g.canal,
  -- Los importados llevan su propia fuente, igual que en el importador real.
  case when g.i % 9 = 0 then 'import' else g.fuente end,
  g.etapa,
  jsonb_build_object(
    'timeline',     g.timeline,
    'financing',    g.financing,
    'budget_tier',  g.budget_tier,
    'agent_status', g.agent_status,
    'geo_fit',      g.geo_fit
  ),
  -- budget_amount alimenta la columna generada leads.budget_amount (orden por
  -- presupuesto). Solo para los tramos que declararon monto.
  case
    when g.i % 9 = 0 then jsonb_build_object('imported', true)
    when g.budget_tier = 'premium' then jsonb_build_object('budget_amount', 650000 + (g.i * 7500))
    when g.budget_tier = 'mid'     then jsonb_build_object('budget_amount', 320000 + (g.i * 4200))
    when g.budget_tier = 'entry'   then jsonb_build_object('budget_amount', 180000 + (g.i * 1500))
    else '{}'::jsonb
  end
from gen g
on conflict (id) do nothing;

-- ── Eventos ───────────────────────────────────────────────────────────────────
-- El trigger sobre lead_events llama a recompute_lead_score en cada insert, asi
-- que los scores salen del motor y no de un valor inventado. Las fechas estan
-- escalonadas a proposito: el decay solo se nota con eventos de edad distinta.
insert into lead_events (lead_id, tenant_id, type, description, created_at, points, dedup_key)
select l.id, l.tenant_id, 'lead_created', 'Lead registrado (formulario)', l.created_at, 0, null
from leads l where l.tenant_id = 'tenant-tenant-test' and l.email like 'lead%@example.com';

insert into lead_events (lead_id, tenant_id, type, description, created_at, points, dedup_key)
select l.id, l.tenant_id, 'form_baseline', 'Formulario enviado', l.created_at, 10, 'form_baseline'
from leads l where l.tenant_id = 'tenant-tenant-test' and l.email like 'lead%@example.com';

-- Clic en email: la metrica de engagement que si cuenta (los opens no).
insert into lead_events (lead_id, tenant_id, type, description, created_at, points, dedup_key)
select l.id, l.tenant_id, 'email_clicked', 'Clic en email de secuencia',
       l.created_at + interval '3 days', 10, null
from leads l
where l.tenant_id = 'tenant-tenant-test' and l.email like 'lead%@example.com'
  and (split_part(split_part(l.email, '@', 1), 'lead', 2))::int % 2 = 0;

insert into lead_events (lead_id, tenant_id, type, description, created_at, points, dedup_key)
select l.id, l.tenant_id, 'contact_us_question', 'Pregunta desde el formulario',
       greatest(l.created_at + interval '5 days', now() - interval '6 days'), 20, null
from leads l
where l.tenant_id = 'tenant-tenant-test' and l.email like 'lead%@example.com'
  and (split_part(split_part(l.email, '@', 1), 'lead', 2))::int % 3 = 0;

insert into lead_events (lead_id, tenant_id, type, description, created_at, points, dedup_key)
select l.id, l.tenant_id, 'email_replied', 'Respondio a un email de la secuencia',
       now() - interval '2 days', 20, null
from leads l
where l.tenant_id = 'tenant-tenant-test' and l.email like 'lead%@example.com'
  and (split_part(split_part(l.email, '@', 1), 'lead', 2))::int % 5 = 0;

-- Acciones que registra el agente a mano (categoria manual, no decaen).
insert into lead_events (lead_id, tenant_id, type, description, created_at, points, dedup_key)
select l.id, l.tenant_id, 'visit_attended', 'Asistio a la visita',
       l.created_at + interval '10 days', 25, null
from leads l
where l.tenant_id = 'tenant-tenant-test' and l.email like 'lead%@example.com'
  and (split_part(split_part(l.email, '@', 1), 'lead', 2))::int % 7 = 0;

insert into lead_events (lead_id, tenant_id, type, description, created_at, points, dedup_key)
select l.id, l.tenant_id, 'proposal_sent', 'Propuesta enviada',
       l.created_at + interval '12 days', 20, null
from leads l
where l.tenant_id = 'tenant-tenant-test' and l.email like 'lead%@example.com'
  and (split_part(split_part(l.email, '@', 1), 'lead', 2))::int % 11 = 0;

-- Dos casos borde que conviene poder ver en pantalla:
-- baja de la lista (bloquea el email) y queja de spam (fuerza la etapa perdido).
insert into lead_events (lead_id, tenant_id, type, description, created_at, points, dedup_key)
select l.id, l.tenant_id, 'email_unsubscribed', 'Se dio de baja de la lista',
       now() - interval '9 days', -40, null
from leads l
where l.tenant_id = 'tenant-tenant-test' and l.email = 'lead43@example.com';

-- El motor de scoring implementa force_perdido pero NO block_email: ese lo
-- aplica el codigo del webhook de Resend, que aqui no interviene. Se marca a
-- mano para que el lead quede como lo dejaria el flujo real.
update leads
set email_blocked = true, email_blocked_reason = 'unsubscribed'
where tenant_id = 'tenant-tenant-test' and email = 'lead43@example.com';

insert into lead_events (lead_id, tenant_id, type, description, created_at, points, dedup_key)
select l.id, l.tenant_id, 'email_spam_complaint', 'Marco el correo como spam',
       now() - interval '4 days', -100, null
from leads l
where l.tenant_id = 'tenant-tenant-test' and l.email = 'lead44@example.com';

-- ── Assets: cortar toda dependencia del storage de produccion ─────────────────
-- El tenant copiado trae logo, portadas de paginas alojadas y fotos de la
-- propiedad apuntando al bucket del proyecto de PRODUCCION. Dos razones para
-- limpiarlas y no para agregar ese host a next.config.ts:
--
--   1. Un entorno de pruebas que lee archivos de produccion no esta aislado.
--   2. next/image rechaza cualquier host que no este en images.remotePatterns,
--      asi que /dashboard responde 500 hasta que se quitan. Es el mismo tropiezo
--      que documenta el CLAUDE.md sobre remotePatterns.
--
-- Se quedan sin imagen y el CRM muestra sus vacios, que tambien conviene ver.
update tenants
set logo_url = null
where logo_url like '%kvmjlrvlnhiarrqxulkr%';

update acquisition_channels
set hosted_page = regexp_replace(hosted_page::text, 'https://kvmjlrvlnhiarrqxulkr\.supabase\.co[^"]*', '', 'g')::jsonb
where hosted_page::text like '%kvmjlrvlnhiarrqxulkr%';

update properties
set image_url = null, gallery = '{}', floor_plans = '{}', detail_pdf_url = null
where image_url like '%kvmjlrvlnhiarrqxulkr%'
   or gallery::text like '%kvmjlrvlnhiarrqxulkr%'
   or floor_plans::text like '%kvmjlrvlnhiarrqxulkr%'
   or detail_pdf_url like '%kvmjlrvlnhiarrqxulkr%';

-- ── Usuarios de auth utilizables por GoTrue ───────────────────────────────────
-- rls_test_create_user deja estas columnas en NULL; GoTrue las espera como
-- cadena vacia. Sin esto, /api/dev/login devuelve 502 aunque el usuario exista.
update auth.users
set instance_id                = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
    confirmation_token         = coalesce(confirmation_token, ''),
    recovery_token             = coalesce(recovery_token, ''),
    email_change               = coalesce(email_change, ''),
    email_change_token_new     = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change               = coalesce(phone_change, ''),
    phone_change_token         = coalesce(phone_change_token, ''),
    reauthentication_token     = coalesce(reauthentication_token, '')
where instance_id is null or confirmation_token is null or recovery_token is null;
