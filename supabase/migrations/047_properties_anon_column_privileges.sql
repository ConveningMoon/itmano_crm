-- Migration 047: column-level SELECT privileges for anon on properties
--
-- The public marketing site reads properties with the anon key. Migration 045's
-- RLS policy (properties_public_select) already restricts anon to published
-- rows (published_to_web = true), but that is a ROW filter — anon could still
-- read every COLUMN of a published row, including internal fields.
--
-- Column-level REVOKE does NOT work here: anon holds SELECT at the whole-table
-- level, and a per-column REVOKE only removes per-column grants (it would appear
-- to succeed while changing nothing — a silent no-op). The correct approach is
-- to drop the table-level SELECT and re-grant SELECT on an explicit column list.
--
-- Withheld from anon: notes, created_by_agent_id, created_by_user_id (internal),
-- mls_number, external_url (internal listing refs), and the legacy `bathrooms`
-- (the web uses the full/half split). RLS still applies the row filter on top.
-- `authenticated` and the service role are untouched.

REVOKE SELECT ON properties FROM anon;

GRANT SELECT (
  id, tenant_id, name, slug, neighborhood, state, property_type, status,
  list_price, address, city, sqft, bedrooms, bathrooms_full, bathrooms_half,
  year_built, garage_spaces, lot_sqft, description_en, description_es,
  features_en, features_es, image_url, gallery, floor_plans, detail_pdf_url,
  published_to_web, created_at, updated_at
) ON properties TO anon;
