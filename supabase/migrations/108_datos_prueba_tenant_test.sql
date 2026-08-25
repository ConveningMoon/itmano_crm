-- Leads ficticios para "Tenant Test" (tenant interno de demo/QA de Dylan).
-- No toca A&J. No dispara correos, Telegram ni scoring de IA: son inserts
-- directos, el envio de secuencias y las notificaciones externas son
-- responsabilidad de la app, no de triggers de Postgres.
-- budget_amount es columna generada desde metadata->>'budget_amount' (migracion 088).

with datos (id, first_name, last_name, email, phone, language, stage, traffic_source, acquisition_channel_id, budget_raw, fit_profile, created_at) as (
  values
    ('lead-test-001', 'Jasmine',   'Carter',    'jasmine.carter82@gmail.com',    '757-201-4483', 'en', 'nuevo',      'direct',    null::uuid, 285000::numeric, '{"timeline":"under_3_months","financing":"preapproved","geo_fit":"zona_principal"}'::jsonb, now() - interval '3 days'),
    ('lead-test-002', 'Michael',   'Thompson',  'mike.thompson.va@yahoo.com',    '757-338-9021', 'en', 'nuevo',      'organic_social',   null, 620000, '{"timeline":"3_6_months","financing":"in_process","geo_fit":"zona_principal","budget_tier":"premium"}', now() - interval '6 days'),
    ('lead-test-003', 'Maria',     'Gonzalez',  'mariagonzalez757@gmail.com',    '757-455-2290', 'es', 'nuevo',      'direct', (select id from acquisition_channels where tenant_id = 'tenant-tenant-test' limit 1), 195000, '{"timeline":"6_12_months","financing":"not_started","geo_fit":"zona_secundaria","budget_tier":"entry"}', now() - interval '9 days'),
    ('lead-test-004', 'David',     'Nguyen',    'dnguyen.realty@outlook.com',    '757-612-7734', 'en', 'nuevo',      'referral',  null, 340000, '{"timeline":"under_3_months","financing":"preapproved","geo_fit":"zona_principal"}', now() - interval '2 days'),
    ('lead-test-005', 'Angela',    'Brooks',    'angela.brooks90@hotmail.com',   '804-223-5567', 'en', 'nuevo',      'direct',    null, null, '{"agent_status":"sin_agente","property_use":"vivienda_principal"}', now() - interval '1 day'),
    ('lead-test-006', 'Carlos',    'Ramirez',   'c.ramirez.hr@gmail.com',        '757-771-4420', 'es', 'nuevo',      'direct', (select id from acquisition_channels where tenant_id = 'tenant-tenant-test' limit 1), 410000, '{"timeline":"3_6_months","financing":"in_process","geo_fit":"zona_principal"}', now() - interval '5 days'),
    ('lead-test-007', 'Brittany',  'Hayes',     'brittany.hayes22@gmail.com',    '757-390-1156', 'en', 'nutricion',  'organic_social',   null, 260000, '{"timeline":"over_12_explorando","financing":"not_started","geo_fit":"zona_secundaria"}', now() - interval '45 days'),
    ('lead-test-008', 'Kevin',     'Patel',     'kevin.patel.va@gmail.com',      '757-508-3392', 'en', 'nutricion',  'direct',    null, 550000, '{"timeline":"6_12_months","financing":"preapproved","geo_fit":"zona_principal","budget_tier":"mid"}', now() - interval '38 days'),
    ('lead-test-009', 'Sofia',     'Martinez',  'sofia.martinez21@yahoo.com',    '757-664-8873', 'es', 'nutricion',  'referral',  null, 230000, '{"agent_status":"sin_agente","timeline":"over_12_explorando"}', now() - interval '52 days'),
    ('lead-test-010', 'James',     'Whitfield', 'jwhitfield.realty@aol.com',     '804-330-9981', 'en', 'nutricion',  'direct',    null, null, '{"property_use":"inversion","agent_status":"con_agente"}', now() - interval '40 days'),
    ('lead-test-011', 'Laura',     'Diaz',      'lauradiaz.hr@gmail.com',        '757-449-2201', 'es', 'nutricion',  'direct', (select id from acquisition_channels where tenant_id = 'tenant-tenant-test' limit 1), 310000, '{"timeline":"6_12_months","financing":"not_started"}', now() - interval '33 days'),
    ('lead-test-012', 'Ryan',      'Foster',    'ryan.foster88@hotmail.com',     '757-217-6690', 'en', 'nutricion',  'organic_social',   null, 275000, '{"timeline":"3_6_months","financing":"in_process","geo_fit":"zona_secundaria"}', now() - interval '48 days'),
    ('lead-test-013', 'Emily',     'Sanders',   'emily.sanders.re@gmail.com',    '757-582-1104', 'en', 'en_proceso', 'direct',    null, 425000, '{"timeline":"under_3_months","financing":"preapproved","geo_fit":"zona_principal","sell_motivation":"alta"}', now() - interval '70 days'),
    ('lead-test-014', 'Jose',      'Fernandez', 'jfernandez.va@gmail.com',       '757-390-8845', 'es', 'en_proceso', 'referral',  null, 610000, '{"timeline":"under_3_months","financing":"cash","geo_fit":"zona_principal","budget_tier":"premium"}', now() - interval '65 days'),
    ('lead-test-015', 'Nicole',    'Adams',     'nicole.adams77@yahoo.com',      '804-556-2298', 'en', 'en_proceso', 'direct', (select id from acquisition_channels where tenant_id = 'tenant-tenant-test' limit 1), 350000, '{"timeline":"3_6_months","financing":"preapproved","geo_fit":"zona_principal"}', now() - interval '58 days'),
    ('lead-test-016', 'Antonio',   'Vega',      'antonio.vega.re@gmail.com',     '757-661-4432', 'es', 'en_proceso', 'direct',    null, 295000, '{"timeline":"under_3_months","financing":"in_process","sell_motivation":"media"}', now() - interval '62 days'),
    ('lead-test-017', 'Heather',   'Coleman',   'heather.coleman33@outlook.com', '757-773-9012', 'en', 'en_proceso', 'organic_social',   null, 480000, '{"timeline":"3_6_months","financing":"preapproved","geo_fit":"zona_principal"}', now() - interval '55 days'),
    ('lead-test-018', 'Brandon',   'Lee',       'brandon.lee.hr@gmail.com',      '757-229-6641', 'en', 'en_proceso', 'direct',    null, null, '{"property_use":"vivienda_principal","listing_status":"no_listado_sin_agente"}', now() - interval '49 days'),
    ('lead-test-019', 'Patricia',  'Alvarez',   'patricia.alvarez55@hotmail.com','757-884-2217', 'es', 'cerrado',    'referral',  null, 265000, '{"timeline":"under_3_months","financing":"cash","sell_motivation":"alta"}', now() - interval '110 days'),
    ('lead-test-020', 'William',   'Turner',    'will.turner.realty@gmail.com',  '804-445-7723', 'en', 'cerrado',    'direct',    null, 720000, '{"timeline":"under_3_months","financing":"cash","geo_fit":"zona_principal","budget_tier":"premium","sell_motivation":"alta"}', now() - interval '95 days'),
    ('lead-test-021', 'Diana',     'Cruz',      'diana.cruz.va@yahoo.com',       '757-390-5567', 'es', 'cerrado',    'direct', (select id from acquisition_channels where tenant_id = 'tenant-tenant-test' limit 1), 245000, '{"timeline":"under_3_months","financing":"preapproved","sell_motivation":"media"}', now() - interval '88 days'),
    ('lead-test-022', 'Gregory',   'Walsh',     'greg.walsh81@gmail.com',        '757-661-2290', 'en', 'cerrado',    'organic_social',   null, 390000, '{"timeline":"under_3_months","financing":"in_process","sell_motivation":"alta"}', now() - interval '102 days'),
    ('lead-test-023', 'Rosa',      'Mendoza',   'rosa.mendoza.re@gmail.com',     '757-556-8834', 'es', 'cerrado',    'direct',    null, 310000, '{"timeline":"under_3_months","financing":"cash","sell_motivation":"alta"}', now() - interval '76 days'),
    ('lead-test-024', 'Todd',      'Simmons',   'todd.simmons.va@hotmail.com',   '757-229-3345', 'en', 'perdido',    'direct',    null, 260000, '{"timeline":"over_12_explorando","financing":"not_started","geo_fit":"fuera_de_zona"}', now() - interval '120 days'),
    ('lead-test-025', 'Monica',    'Reeves',    'monica.reeves90@gmail.com',     '804-338-1187', 'en', 'perdido',    'organic_social',   null, null, '{"agent_status":"con_agente","listing_status":"ya_listado_con_agente"}', now() - interval '115 days'),
    ('lead-test-026', 'Esteban',   'Rojas',     'esteban.rojas.hr@yahoo.com',    '757-771-9923', 'es', 'perdido',    'referral',  null, 190000, '{"geo_fit":"fuera_de_zona","timeline":"over_12_explorando"}', now() - interval '130 days'),
    ('lead-test-027', 'Katelyn',   'Brooks',    'katelyn.brooks12@gmail.com',    '757-449-6612', 'en', 'perdido',    'direct',    null, null, '{}', now() - interval '140 days'),
    ('lead-test-028', 'Victor',    'Salinas',   'victor.salinas.re@outlook.com', '757-508-2276', 'es', 'perdido',    'direct', (select id from acquisition_channels where tenant_id = 'tenant-tenant-test' limit 1), 210000, '{}', now() - interval '150 days'),
    ('lead-test-029', 'Ashley',    'Porter',    'ashley.porter44@gmail.com',     '757-390-3321', 'en', 'nuevo',      'organic_social',   null, 500000, '{"timeline":"3_6_months","financing":"preapproved","geo_fit":"zona_principal","budget_tier":"mid"}', now() - interval '4 days'),
    ('lead-test-030', 'Luis',      'Ortega',    'luis.ortega.va@gmail.com',      '757-661-7789', 'es', 'nuevo',      'direct',    null, 275000, '{"timeline":"under_3_months","financing":"not_started","geo_fit":"zona_secundaria"}', now() - interval '7 days')
)
insert into leads (id, tenant_id, agent_id, first_name, last_name, email, phone, language, stage, traffic_source, acquisition_channel_id, metadata, fit_profile, created_at, updated_at)
select d.id, 'tenant-tenant-test', 'agent-dylan-owner', d.first_name, d.last_name, d.email, d.phone, d.language, d.stage, d.traffic_source, d.acquisition_channel_id,
       case when d.budget_raw is not null then jsonb_build_object('budget_amount', d.budget_raw) else null end,
       d.fit_profile, d.created_at, d.created_at
from datos d;

-- Evento base para todos, mas engagement variado para una porcion realista.
insert into lead_events (lead_id, tenant_id, type, description, points, dedup_key, metadata, created_at)
select id, 'tenant-tenant-test', 'lead_created', 'Lead creado', 0, null, '{"source":"manual"}'::jsonb, created_at
from leads where tenant_id = 'tenant-tenant-test';

insert into lead_events (lead_id, tenant_id, type, description, points, dedup_key, metadata, created_at)
values
  ('lead-test-001', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '3 days'),
  ('lead-test-001', 'tenant-tenant-test', 'email_clicked',       'Clic en email',       10, 'msg_test_001_click1', null, now() - interval '2 days'),
  ('lead-test-002', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '6 days'),
  ('lead-test-002', 'tenant-tenant-test', 'email_clicked',       'Clic en email',       10, 'msg_test_002_click1', null, now() - interval '4 days'),
  ('lead-test-003', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '9 days'),
  ('lead-test-004', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '2 days'),
  ('lead-test-004', 'tenant-tenant-test', 'contact_us_question', 'Pregunta en formulario de contacto', 20, null, '{"reason":"buy","source":"contact_us"}', now() - interval '1 day'),
  ('lead-test-006', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '5 days'),
  ('lead-test-006', 'tenant-tenant-test', 'email_clicked',       'Clic en email',       10, 'msg_test_006_click1', null, now() - interval '3 days'),
  ('lead-test-007', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '45 days'),
  ('lead-test-007', 'tenant-tenant-test', 'email_clicked',       'Clic en email',       10, 'msg_test_007_click1', null, now() - interval '40 days'),
  ('lead-test-008', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '38 days'),
  ('lead-test-008', 'tenant-tenant-test', 'second_lm',           'Descargo segundo lead magnet', 8,  'msg_test_008_lm2', null, now() - interval '30 days'),
  ('lead-test-011', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '33 days'),
  ('lead-test-011', 'tenant-tenant-test', 'email_clicked',       'Clic en email',       10, 'msg_test_011_click1', null, now() - interval '20 days'),
  ('lead-test-013', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '70 days'),
  ('lead-test-013', 'tenant-tenant-test', 'email_replied',       'Respondio un email', 20, 'msg_test_013_reply1', null, now() - interval '60 days'),
  ('lead-test-013', 'tenant-tenant-test', 'third_lm',            'Descargo tercer lead magnet', 12, 'msg_test_013_lm3', null, now() - interval '50 days'),
  ('lead-test-014', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '65 days'),
  ('lead-test-014', 'tenant-tenant-test', 'email_clicked',       'Clic en email',       10, 'msg_test_014_click1', null, now() - interval '55 days'),
  ('lead-test-015', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '58 days'),
  ('lead-test-017', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '55 days'),
  ('lead-test-017', 'tenant-tenant-test', 'email_clicked',       'Clic en email',       10, 'msg_test_017_click1', null, now() - interval '45 days'),
  ('lead-test-019', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '110 days'),
  ('lead-test-019', 'tenant-tenant-test', 'email_replied',       'Respondio un email', 20, 'msg_test_019_reply1', null, now() - interval '90 days'),
  ('lead-test-020', 'tenant-tenant-test', 'form_baseline',       'Formulario enviado', 10, 'form_baseline', null, now() - interval '95 days'),
  ('lead-test-020', 'tenant-tenant-test', 'email_clicked',       'Clic en email',       10, 'msg_test_020_click1', null, now() - interval '80 days'),
  ('lead-test-027', 'tenant-tenant-test', 'manual_disqualify',   'Descalificado manualmente', 0,  null, '{"reason":"no responde, telefono desconectado"}', now() - interval '138 days'),
  ('lead-test-028', 'tenant-tenant-test', 'email_spam_complaint','Queja de spam', -100, null, '{"resend_email_id":"seed-test-028"}', now() - interval '148 days');

-- Recalcula los scores desde la funcion autoritativa, no a mano.
do $$
declare r record;
begin
  for r in select id from leads where tenant_id = 'tenant-tenant-test' loop
    perform recompute_lead_score(r.id);
  end loop;
end $$;
