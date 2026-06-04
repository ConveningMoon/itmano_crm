-- Migration 030: entry-signal scoring rule — event_submission.
--
-- Adds a global engagement rule so registering to an in-person event scores as a
-- committed action (+20), parallel to contact_us_question. Combined with the
-- form_baseline (+10, already seeded in 029, now emitted for the first form of ANY
-- channel type by the app), an event or contact-us lead is born with a real score
-- from engagement-by-action — without reintroducing a per-channel baseline.
--
-- Idempotent via the lead_score_rules unique index
-- (tenant_id, category, dimension, coalesce(match_value, '')) nulls not distinct.

insert into lead_score_rules (tenant_id, category, dimension, event_type, points, decays, is_active, label)
values (null, 'engagement', 'event_submission', 'event_submission', 20, true, true, 'Registro a evento')
on conflict (tenant_id, category, dimension, coalesce(match_value, '')) do nothing;
