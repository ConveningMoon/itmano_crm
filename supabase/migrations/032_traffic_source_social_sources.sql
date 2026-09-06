-- Migration 032: traffic_source — drop manychat_inbound, add social direct-entry sources.
--
-- 'manychat_inbound' is removed (0 leads use it; ManyChat is tracked as the
-- manychat_flow acquisition channel_type, a separate axis). 'instagram',
-- 'facebook' and 'whatsapp' are added so the manual lead-registration form can set
-- the arrival source directly for social DM walk-ins (channel stays 'manual').
-- The other six values are preserved. No data migration (no rows use manychat_inbound).

alter table leads drop constraint if exists leads_traffic_source_check;
alter table leads add constraint leads_traffic_source_check
  check (traffic_source = any (array[
    'ads_meta',
    'ads_google',
    'organic_social',
    'direct',
    'referral',
    'unknown',
    'instagram',
    'facebook',
    'whatsapp'
  ]::text[]));
