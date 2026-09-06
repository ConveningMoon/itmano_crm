-- Harden notify_telegram_on_insert: trim whitespace from Vault secret before use.
-- Root cause of telegram_sent=false: secret stored in Vault with trailing \r\n
-- (copy-paste artifact), causing Authorization header mismatch at Vercel endpoint.
-- trim(both from coalesce(...,'')) handles NULL, \n, \r\n, and leading/trailing spaces.

create or replace function notify_telegram_on_insert()
returns trigger language plpgsql security definer as $$
declare
  v_url    text := 'https://app.itmano.com/api/notifications/dispatch';
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'notifications_webhook_secret'
  limit 1;

  v_secret := trim(both from coalesce(v_secret, ''));

  if v_secret = '' then
    raise notice 'notify_telegram_on_insert: secret not in vault, skipping dispatch';
    return NEW;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := json_build_object('notification_id', NEW.id::text)::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    )
  );

  return NEW;
end;
$$;
