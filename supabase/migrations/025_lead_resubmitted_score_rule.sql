-- Migration 025: score rule for lead_resubmitted event
--
-- +5 points when a known lead re-submits an intake form.
-- Signals re-engagement without inflating score like a nuclear event.
-- Guarded with NOT EXISTS since lead_score_rules has no UNIQUE constraint.

INSERT INTO lead_score_rules (tenant_id, event_type, points, side_effect)
SELECT null, 'lead_resubmitted', 5, null
WHERE NOT EXISTS (
  SELECT 1 FROM lead_score_rules
  WHERE event_type = 'lead_resubmitted' AND tenant_id IS NULL
);
