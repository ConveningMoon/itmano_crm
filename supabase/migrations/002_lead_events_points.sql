-- Add points delta to events (nullable — system events like lead_created have no points)
ALTER TABLE lead_events ADD COLUMN points integer;

-- Allow NULL score for terminal leads (closed/lost)
ALTER TABLE leads ALTER COLUMN temperature_score DROP NOT NULL;

-- Purchase process details (one row per process_started lead)
CREATE TABLE purchase_processes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      text        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id    text        NOT NULL REFERENCES tenants(id),
  address      text        NOT NULL,
  loan_type    text        NOT NULL,
  closing_date date,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE purchase_processes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_processes_select" ON purchase_processes
  FOR SELECT USING (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE POLICY "purchase_processes_insert" ON purchase_processes
  FOR INSERT WITH CHECK (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE POLICY "purchase_processes_update" ON purchase_processes
  FOR UPDATE USING (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE POLICY "purchase_processes_delete" ON purchase_processes
  FOR DELETE USING (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE INDEX idx_purchase_processes_lead_id ON purchase_processes(lead_id);
