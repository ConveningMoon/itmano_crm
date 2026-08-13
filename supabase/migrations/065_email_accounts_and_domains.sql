-- 065 · Cuenta Resend por tenant + verificación de dominio de envío.
--
-- resend_account: qué cuenta de Resend usa el tenant para enviar. 'aj' = la
-- cuenta de Adriana (RESEND_API_KEY, legacy — se deja intacta); 'itmano' = la
-- cuenta de ITMANO (RESEND_API_KEY_ITMANO) para el tenant Test y futuros.
alter table tenants
  add column if not exists resend_account text not null default 'itmano';

-- Dominio de envío propio (Growth/Partner) verificado en la cuenta de ITMANO
-- vía la API de Domains de Resend. Si no está verificado, los correos salen del
-- dominio compartido de ITMANO mientras tanto.
alter table tenants
  add column if not exists sending_domain    text;
alter table tenants
  add column if not exists resend_domain_id  text;
-- 'not_configured' | 'pending' | 'verified' | 'failed' | 'temporary_failure'
alter table tenants
  add column if not exists domain_status     text not null default 'not_configured';
-- Registros DNS (DKIM/SPF/MX) devueltos por Resend, para mostrarlos al tenant.
alter table tenants
  add column if not exists domain_records    jsonb;

-- A&J (Adriana) se queda en su cuenta Resend actual.
update tenants set resend_account = 'aj' where slug = 'aj-real-estate';
