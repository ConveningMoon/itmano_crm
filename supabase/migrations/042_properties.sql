-- Migration 041: properties table
-- Stores agency property listings. Visibility is tenant-wide (all roles see all
-- properties for their tenant). Write access is asymmetric:
--   super_admin  → any property
--   agent_owner  → any property in their tenant
--   agent        → only properties they created (matched via created_by_user_id)
--
-- All writes go through createAdminClient() (service role); no insert/update/delete
-- RLS policies are needed. SELECT policy mirrors the lead_events pattern.

CREATE TABLE IF NOT EXISTS properties (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            text          NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  created_by_agent_id  text          REFERENCES agents(id)               ON DELETE SET NULL,
  created_by_user_id   uuid          REFERENCES auth.users(id)           ON DELETE SET NULL,
  address              text          NOT NULL,
  city                 text,
  mls_number           text,
  property_type        text          NOT NULL CHECK (property_type IN (
                                       'residential', 'condo', 'townhouse',
                                       'land', 'commercial', 'multifamily'
                                     )),
  list_price           numeric(12,2) CHECK (list_price >= 0),
  bedrooms             smallint      CHECK (bedrooms >= 0),
  bathrooms            numeric(3,1)  CHECK (bathrooms >= 0),
  sqft                 int           CHECK (sqft >= 0),
  year_built           smallint      CHECK (year_built BETWEEN 1800 AND 2100),
  status               text          NOT NULL DEFAULT 'available' CHECK (status IN (
                                       'available', 'in_process', 'sold'
                                     )),
  external_url         text,
  notes                text,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

-- Lookup by tenant (status filter + recency ordering for the list view)
CREATE INDEX IF NOT EXISTS properties_tenant_status_idx
  ON properties (tenant_id, status, created_at DESC);

-- Lookup by author (for agent-scoped queries if needed in future)
CREATE INDEX IF NOT EXISTS properties_created_by_agent_id_idx
  ON properties (created_by_agent_id);

-- RLS — select: tenant-scoped for authenticated users; super_admin sees all
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "properties_select" ON properties
  FOR SELECT USING (is_super_admin() OR tenant_id = get_my_tenant_id());
