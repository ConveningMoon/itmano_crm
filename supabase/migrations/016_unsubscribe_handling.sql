-- Migration 016: codify schema drift — cancel_runs_on_lead_event
--
-- cancel_runs_on_lead_event() and trg_cancel_runs_on_lead_event exist in
-- production as schema drift (created manually without a migration file).
-- This migration captures them idempotently so the trigger is reproducible
-- from migrations alone.
--
-- Behavior:
--   email_unsubscribed → cancel active sequence runs, cancelled_reason = 'unsubscribed'
--   email_replied      → cancel active sequence runs, cancelled_reason = 'replied'
--   All other types    → no-op (returns immediately)
--
-- This fires AFTER INSERT on lead_events, alongside trg_lead_event_scoring.
-- The scoring trigger applies the -50 point delta; this trigger cancels the runs.

create or replace function cancel_runs_on_lead_event()
returns trigger language plpgsql as $$
declare
  v_reason text;
begin
  if NEW.type = 'email_unsubscribed' then
    v_reason := 'unsubscribed';
  elsif NEW.type = 'email_replied' then
    v_reason := 'replied';
  else
    return NEW;
  end if;

  update lead_sequence_runs
  set    status           = 'cancelled',
         cancelled_reason = v_reason,
         completed_at     = now()
  where  lead_id = NEW.lead_id
    and  status  = 'active';

  return NEW;
end;
$$;

drop trigger if exists trg_cancel_runs_on_lead_event on lead_events;

create trigger trg_cancel_runs_on_lead_event
  after insert on lead_events
  for each row execute function cancel_runs_on_lead_event();
