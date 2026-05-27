-- Replace notify_telegram_on_insert to read the webhook secret from Supabase Vault
-- instead of a DB parameter (ALTER DATABASE SET requires superuser — blocked on Supabase).
--
-- Prerequisites (already done by Dylan):
--   - Secret stored in Vault: name = 'notifications_webhook_secret'
--   - NOTIFICATIONS_WEBHOOK_SECRET added to Vercel env vars
--
-- The trigger trg_notify_telegram already points to this function — no changes needed there.

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

  if v_secret is null or v_secret = '' then
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
