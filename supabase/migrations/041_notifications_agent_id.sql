-- Migration 041: per-agent notification routing
--
-- (1) Add nullable agent_id FK: lead-linked notifications carry the lead's agent;
--     administrative notifications (no lead) remain NULL → owner-only.
-- (2) Index for agent-scoped bell reads.
-- (3) Backfill existing lead-linked notifications from leads.agent_id.
-- (4) Update RLS select: role='agent' sees only their own; agent_owner/super_admin
--     see the full tenant (as before). Dispatch runs with service_role → bypasses RLS.
-- (5) Recreate recompute_lead_score() with agent_id on the hot_lead insert.
--     All scoring logic is byte-identical to migration 029 — only the notifications
--     INSERT gains `agent_id = v_lead.agent_id`.

-- ── 1. Column ─────────────────────────────────────────────────────────────────

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS agent_id text
  REFERENCES agents(id) ON DELETE SET NULL;

-- ── 2. Index ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS notifications_agent_id_idx
  ON notifications (tenant_id, agent_id)
  WHERE agent_id IS NOT NULL;

-- ── 3. Backfill ───────────────────────────────────────────────────────────────
-- Populate agent_id for existing notifications that are tied to a lead.
-- Administrative notifications (lead_id IS NULL) stay NULL.

UPDATE notifications n
SET    agent_id = l.agent_id
FROM   leads l
WHERE  n.lead_id  = l.id
  AND  n.agent_id IS NULL
  AND  l.agent_id IS NOT NULL;

-- ── 4. RLS select ─────────────────────────────────────────────────────────────
-- agent_owner and super_admin: unchanged (full tenant / all tenants).
-- role='agent': restricted to notifications where agent_id matches their agents row.

DROP POLICY IF EXISTS "notifications_select" ON notifications;

CREATE POLICY "notifications_select" ON notifications FOR SELECT
  USING (
    is_super_admin()
    OR (
      tenant_id = get_my_tenant_id()
      AND (
        -- Non-agent roles (agent_owner) see the full tenant
        (SELECT role FROM user_profiles WHERE id = auth.uid()) <> 'agent'
        -- Agent role: only see notifications assigned to them
        OR agent_id = (
          SELECT id FROM agents
          WHERE  user_id   = auth.uid()
            AND  tenant_id = get_my_tenant_id()
        )
      )
    )
  );

-- ── 5. Recreate recompute_lead_score — add agent_id to hot_lead insert ────────
-- Scoring logic is identical to migration 029. Only change: the notifications
-- INSERT now includes `agent_id = v_lead.agent_id`.

CREATE OR REPLACE FUNCTION public.recompute_lead_score(p_lead_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_lead          leads%rowtype;
  v_fit           integer;
  v_eng           integer;
  v_man           integer;
  v_total         integer;
  v_old_current   integer;
  v_new_status    text;
  v_force_perdido boolean;
  v_last_event    timestamptz;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then return; end if;

  -- Respect freeze: post-funnel / agent-driven statuses never recompute.
  if v_lead.status in ('process_started','process_completed','closed','lost') then
    return;
  end if;

  v_old_current := coalesce(v_lead.current_score, 0);

  -- FIT — sum active fit rules matching each (dimension,value) in fit_profile.
  -- distinct on (dimension) lets a tenant-specific rule override the global one.
  select coalesce(sum(points), 0) into v_fit
  from (
    select distinct on (r.dimension) r.points
    from   lead_score_rules r
    where  r.category = 'fit' and r.is_active
      and  (r.tenant_id = v_lead.tenant_id or r.tenant_id is null)
      and  v_lead.fit_profile ->> r.dimension = r.match_value
    order  by r.dimension, r.tenant_id nulls last
  ) f;

  -- ENGAGEMENT — per event. Positive (decays) decays by the event's own age
  -- (half-life 0.5^((days-14)/30) after a 14-day grace); negative persists full.
  select coalesce(sum(eff), 0) into v_eng
  from (
    select distinct on (e.id)
      case when r.decays then
        round(r.points::numeric * (
          case when (extract(epoch from (now() - e.created_at)) / 86400.0) <= 14 then 1
               else power(0.5, ((extract(epoch from (now() - e.created_at)) / 86400.0) - 14.0) / 30.0)
          end
        ))::integer
      else r.points end as eff
    from   lead_events e
    join   lead_score_rules r
           on  r.dimension = e.type and r.category = 'engagement' and r.is_active
           and (r.tenant_id = e.tenant_id or r.tenant_id is null)
    where  e.lead_id = p_lead_id
    order  by e.id, r.tenant_id nulls last
  ) eng;

  -- MANUAL — per event, no decay.
  select coalesce(sum(pts), 0) into v_man
  from (
    select distinct on (e.id) r.points as pts
    from   lead_events e
    join   lead_score_rules r
           on  r.dimension = e.type and r.category = 'manual' and r.is_active
           and (r.tenant_id = e.tenant_id or r.tenant_id is null)
    where  e.lead_id = p_lead_id
    order  by e.id, r.tenant_id nulls last
  ) man;

  -- force_perdido (spam complaint, manual disqualify) → 0 / lost.
  select exists (
    select 1
    from   lead_events e
    join   lead_score_rules r
           on  r.dimension = e.type and r.is_active and r.side_effect = 'force_perdido'
           and (r.tenant_id = e.tenant_id or r.tenant_id is null)
    where  e.lead_id = p_lead_id
  ) into v_force_perdido;

  if v_force_perdido then
    v_total      := 0;
    v_new_status := 'lost';
  else
    v_total := greatest(0, least(100, v_fit + v_eng + v_man));
    v_new_status := case
      when v_total >= 60 then 'hot'
      when v_total >= 35 then 'warm'
      when v_total >= 15 then 'nurturing'
      else                    'new'
    end;
  end if;

  select max(created_at) into v_last_event from lead_events where lead_id = p_lead_id;

  -- Tag the status-history trigger as system/trigger-sourced.
  perform set_config('app.history_source', 'trigger', true);

  update leads
  set    fit_score        = v_fit,
         engagement_score = v_eng,
         manual_score     = v_man,
         current_score    = v_total,
         peak_score       = greatest(coalesce(peak_score, 0), v_total),
         status           = v_new_status,
         last_event_at    = coalesce(v_last_event, last_event_at),
         score_updated_at = now()
  where  id = p_lead_id;

  -- hot_lead notification — rising edge ≥80 — now includes agent_id.
  if v_old_current < 80 and v_total >= 80 and not v_force_perdido then
    insert into notifications (tenant_id, type, lead_id, agent_id, message)
    values (
      v_lead.tenant_id,
      'hot_lead',
      p_lead_id,
      v_lead.agent_id,
      v_lead.first_name || ' ' || v_lead.last_name || ' alcanzó score ' || v_total
    );
  end if;
end;
$function$;
