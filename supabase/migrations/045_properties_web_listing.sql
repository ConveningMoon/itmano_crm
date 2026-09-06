-- Migration 045: web listing fields on properties
-- Extends the properties table so a tenant's public marketing site (today:
-- A&J's web at ajrealestateva.com) can serve its listings straight from the
-- CRM database instead of a separate Supabase project.
--
-- Design decisions (2026-07-08, documented in E:/CLAUDE.md master plan):
--   * Single source of truth: same table serves the internal CRM module and
--     the public web. All new columns are nullable so the existing internal
--     flow keeps working unchanged.
--   * `state` is free text (no VA/NC check) — the CRM is multi-tenant and a
--     future tenant may not be in the US. The consuming site validates.
--   * Public exposure is opt-in per property via `published_to_web`.
--   * Bilingual content: description/features stored in EN and ES columns.
--   * `bathrooms` (numeric) stays for internal display; the web needs the
--     full/half split, so both are stored and `bathrooms` is backfilled.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS name             text,
  ADD COLUMN IF NOT EXISTS slug             text,
  ADD COLUMN IF NOT EXISTS neighborhood     text,
  ADD COLUMN IF NOT EXISTS state            text,
  ADD COLUMN IF NOT EXISTS bathrooms_full   smallint CHECK (bathrooms_full >= 0),
  ADD COLUMN IF NOT EXISTS bathrooms_half   smallint CHECK (bathrooms_half >= 0),
  ADD COLUMN IF NOT EXISTS garage_spaces    smallint CHECK (garage_spaces >= 0),
  ADD COLUMN IF NOT EXISTS lot_sqft         int      CHECK (lot_sqft >= 0),
  ADD COLUMN IF NOT EXISTS description_en   text,
  ADD COLUMN IF NOT EXISTS description_es   text,
  ADD COLUMN IF NOT EXISTS features_en      text[],
  ADD COLUMN IF NOT EXISTS features_es      text[],
  ADD COLUMN IF NOT EXISTS image_url        text,
  ADD COLUMN IF NOT EXISTS gallery          text[],
  ADD COLUMN IF NOT EXISTS floor_plans      text[],
  ADD COLUMN IF NOT EXISTS detail_pdf_url   text,
  ADD COLUMN IF NOT EXISTS published_to_web boolean NOT NULL DEFAULT false;

-- Slug is the public URL segment (/houses/<slug>). Unique per tenant,
-- only enforced when present.
CREATE UNIQUE INDEX IF NOT EXISTS properties_tenant_slug_key
  ON properties (tenant_id, slug)
  WHERE slug IS NOT NULL;

-- Backfill the full/half split from the legacy single `bathrooms` value.
UPDATE properties
SET bathrooms_full = floor(bathrooms)::smallint,
    bathrooms_half = CASE WHEN bathrooms - floor(bathrooms) >= 0.5 THEN 1 ELSE 0 END
WHERE bathrooms IS NOT NULL
  AND bathrooms_full IS NULL;

-- Public read for the marketing site: the anon role only sees properties the
-- tenant explicitly published. Authenticated CRM access keeps using the
-- existing tenant-scoped policy (properties_select, migration 042).
CREATE POLICY "properties_public_select" ON properties
  FOR SELECT TO anon
  USING (published_to_web = true);

-- Serves the public listing query (tenant filter + published flag).
CREATE INDEX IF NOT EXISTS properties_published_web_idx
  ON properties (tenant_id)
  WHERE published_to_web = true;

-- Media bucket for property photos, floor plans, and detail PDFs.
-- Public bucket → files are readable via their public URL without RLS
-- policies on storage.objects. Uploads go through the service-role client
-- only (same asymmetric-write model as the properties table itself), so no
-- insert/update/delete storage policies are needed.
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-media', 'property-media', true)
ON CONFLICT (id) DO NOTHING;
