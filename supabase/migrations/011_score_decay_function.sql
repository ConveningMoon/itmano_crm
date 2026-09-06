-- Migration 011: decay_lead_scores() SQL function
--
-- Called hourly by POST /api/cron/score-decay (Vercel Cron).
-- Recomputes current_score for leads that have been inactive for > 14 days
-- using the half-life decay formula from CLAUDE.md:
--
--   current_score = peak_score × 0.5 ^ ((days_since_last_event - 14) / 30)
--
-- Also demotes status bands when the decayed score crosses a threshold downward,
-- writing a lead_status_history row on each transition.
--
-- p_dry_run = true: returns affected rows without writing anything (for testing).

create or replace function decay_lead_scores(p_dry_run boolean default false)
returns table(
  affected_lead_id  text,
  lead_tenant_id    text,
  old_score         integer,
  new_score         integer,
  old_status        text,
  new_status        text,
  status_changed    boolean
) language plpgsql security definer as $$
declare
  r               leads%rowtype;
  v_days_since    float;
  v_decayed_score integer;
  v_decayed_status text;
begin
  for r in
    select *
    from   leads
    where  status not in ('process_started', 'process_completed', 'closed', 'lost')
      and  peak_score    is not null
      and  last_event_at is not null
      and  last_event_at < now() - interval '14 days'
    order  by last_event_at asc  -- oldest-inactive first
  loop
    v_days_since    := extract(epoch from (now() - r.last_event_at)) / 86400.0;
    v_decayed_score := greatest(
      0,
      round(r.peak_score::numeric * power(0.5, (v_days_since - 14.0) / 30.0))::integer
    );

    v_decayed_status := case
      when v_decayed_score >= 60 then 'hot'
      when v_decayed_score >= 35 then 'warm'
      when v_decayed_score >= 15 then 'nurturing'
      else                            'new'
    end;

    -- Populate output row
    affected_lead_id := r.id;
    lead_tenant_id   := r.tenant_id;
    old_score        := coalesce(r.current_score, r.peak_score);
    new_score        := v_decayed_score;
    old_status       := r.status;
    new_status       := v_decayed_status;
    status_changed   := v_decayed_status <> r.status;
    return next;

    if not p_dry_run then
      update leads
      set  current_score    = v_decayed_score,
           status           = v_decayed_status,
           score_updated_at = now()
      where id = r.id;

      if v_decayed_status <> r.status then
        insert into lead_status_history (lead_id, tenant_id, from_status, to_status, source)
        values (r.id, r.tenant_id, r.status, v_decayed_status, 'system');
      end if;
    end if;
  end loop;
end;
$$;
