-- Migration 018: Telegram notification delivery
--
-- 1. Installs pg_net extension (required for async HTTP calls from triggers)
-- 2. Adds telegram_chat_id to user_profiles (set manually per user after migration)
-- 3. Adds telegram_sent / telegram_sent_at delivery tracking to notifications
-- 4. Installs a AFTER INSERT trigger on notifications that POSTs asynchronously
--    to /api/notifications/dispatch — does NOT block the originating transaction
--
-- ── Manual setup required after applying this migration ──────────────────────
-- Run once in the Supabase SQL Editor (replace <value> with the same string
-- used for NOTIFICATIONS_WEBHOOK_SECRET in Vercel / .env.local):
--
--   ALTER DATABASE postgres
--     SET "app.notifications_webhook_secret" = '<value>';
--   SELECT pg_reload_conf();
--
-- Then set telegram_chat_id for each user (get the chat_id by messaging @userinfobot):
--
--   UPDATE user_profiles
--   SET telegram_chat_id = '<chat_id>'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'dj.vergara@hotmail.com');
--
--   UPDATE user_profiles
--   SET telegram_chat_id = '<chat_id>'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'adrysofirealestate@gmail.com');
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. pg_net — async HTTP from Postgres ─────────────────────────────────────

create extension if not exists pg_net schema extensions;

-- ── 2. user_profiles: Telegram chat ID ───────────────────────────────────────

alter table user_profiles
  add column if not exists telegram_chat_id text;

-- ── 3. notifications: delivery tracking ──────────────────────────────────────

alter table notifications
  add column if not exists telegram_sent    boolean not null default false,
  add column if not exists telegram_sent_at timestamptz;

-- Partial index: fast sweep of pending notifications (future retry cron, Phase 5)
create index if not exists idx_notifications_telegram_pending
  on notifications (created_at)
  where telegram_sent = false;

-- ── 4. Webhook trigger on notifications INSERT ────────────────────────────────
-- Fires an async POST to /api/notifications/dispatch after every notification
-- row is inserted. The HTTP call is non-blocking — the INSERT transaction
-- commits immediately regardless of the HTTP outcome.
--
-- The secret is read from a database-level parameter set via the manual step
-- above. If the parameter is not set, the Authorization header is empty and
-- the dispatch endpoint rejects the request silently (no crash, no retry).

create or replace function notify_telegram_on_insert()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url     := 'https://app.itmano.com/api/notifications/dispatch',
    body    := convert_to(
                 json_build_object('notification_id', NEW.id::text)::text,
                 'UTF8'
               ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(
        current_setting('app.notifications_webhook_secret', true), ''
      )
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_telegram on notifications;
create trigger trg_notify_telegram
  after insert on notifications
  for each row execute function notify_telegram_on_insert();
