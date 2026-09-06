-- Fix 021: trim(both from ...) in Postgres only strips ASCII spaces, not \r or \n.
-- btrim(str, E' \t\r\n') strips all common whitespace characters from both ends.
-- Same correction applied to the user_profiles UPDATE in this migration.

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

  v_secret := btrim(coalesce(v_secret, ''), E' \t\r\n');

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

-- Clean trailing CR/LF from any telegram_chat_id values entered with copy-paste artifacts
update user_profiles
set telegram_chat_id = btrim(telegram_chat_id, E' \t\r\n')
where telegram_chat_id is not null
  and telegram_chat_id <> btrim(telegram_chat_id, E' \t\r\n');
