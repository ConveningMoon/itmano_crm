-- ─── Add channel attribution columns to leads ─────────────────────────────────

alter table leads
  add column acquisition_channel_id uuid
    references acquisition_channels(id) on delete set null,
  add column traffic_source text
    check (traffic_source in (
      'ads_meta','ads_google','organic_social','direct',
      'manychat_inbound','referral','unknown'
    )),
  add column traffic_source_detail jsonb;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index idx_leads_acquisition_channel_status
  on leads(acquisition_channel_id, status);

create index if not exists idx_leads_tenant_score
  on leads(tenant_id, temperature_score desc nulls last);
