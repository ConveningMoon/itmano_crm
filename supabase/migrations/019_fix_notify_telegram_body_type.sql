-- Fix: notify_telegram_on_insert was passing body as bytea (convert_to) instead of jsonb.
-- pg_net 0.20.0 requires body := jsonb. The type mismatch caused every INSERT INTO
-- notifications to roll back, silently dropping all notification rows.
--
-- Additional improvements:
--   - URL read from DB parameter app.notifications_webhook_url (guard: skip if not set)
--   - Secret read from DB parameter app.notifications_webhook_secret
--   - RAISE NOTICE (not EXCEPTION) on misconfiguration so the trigger never aborts the INSERT
--
-- Dylan must run after deploying (requires superuser — cannot be run via MCP):
--   ALTER DATABASE postgres SET "app.notifications_webhook_url"    = 'https://app.itmano.com/api/notifications/dispatch';
--   ALTER DATABASE postgres SET "app.notifications_webhook_secret" = '<NOTIFICATIONS_WEBHOOK_SECRET value from .env.local>';
--   SELECT pg_reload_conf();

create or replace function notify_telegram_on_insert()
returns trigger language plpgsql security definer as $$
declare
  v_url    text := current_setting('app.notifications_webhook_url',    true);
  v_secret text := current_setting('app.notifications_webhook_secret', true);
begin
  if v_url is null or v_url = '' then
    raise notice 'notify_telegram_on_insert: app.notifications_webhook_url not configured, skipping';
    return NEW;
  end if;

  if v_secret is null or v_secret = '' then
    raise notice 'notify_telegram_on_insert: app.notifications_webhook_secret not configured, Authorization header will be empty';
  end if;

  perform net.http_post(
    url     := v_url,
    body    := json_build_object('notification_id', NEW.id::text)::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(v_secret, '')
    )
  );

  return NEW;
end;
$$;
