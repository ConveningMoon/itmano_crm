-- Migration 007: Remove lead_sources — unify lead attribution on acquisition_channels
--
-- leads.acquisition_channel_id (uuid FK → acquisition_channels.id) is the single
-- attribution column going forward. leads.source_id (text FK → lead_sources.id)
-- was a Phase-1 legacy field seeded only with demo data and is now redundant.
--
-- Steps:
--   1. Drop FK constraint that blocks the DROP TABLE
--   2. Drop the source_id column from leads
--   3. Drop the lead_sources table

-- 1. Drop FK
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_id_fkey;

-- 2. Drop column
ALTER TABLE leads DROP COLUMN IF EXISTS source_id;

-- 3. Drop table (cascades any remaining dependent objects, though there are none)
DROP TABLE IF EXISTS lead_sources CASCADE;
