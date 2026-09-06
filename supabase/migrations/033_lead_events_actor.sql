-- Migration 033: lead_events.actor_user_id — who performed the action.
--
-- null = system (intake/webhooks/triggers/automatic promotion-demotion). Set for
-- human-driven events (manual scoring panel, status changes, manual lead creation,
-- import). ON DELETE SET NULL so deleting a login doesn't erase the activity log.

alter table lead_events
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null;

-- The data layer filters by it (agent visibility) and resolves display names.
create index if not exists idx_lead_events_actor on lead_events(actor_user_id);

-- Backfill: the ONLY historical emitter that recorded an actor is applyManualAction
-- (metadata.actor_user_id). Populate the column from there, only for well-formed
-- UUIDs that still exist in auth.users. Everything else stays null (legitimately
-- system / unknown — we do not infer authors for old status_changed events).
update lead_events e
set actor_user_id = (e.metadata->>'actor_user_id')::uuid
where e.actor_user_id is null
  and e.metadata ? 'actor_user_id'
  and e.metadata->>'actor_user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (select 1 from auth.users u where u.id = (e.metadata->>'actor_user_id')::uuid);
