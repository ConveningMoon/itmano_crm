-- Migration 048: drop the 1800-2100 CHECK on properties.year_built.
-- Some historic Hampton Roads homes predate 1800; the bound was an arbitrary
-- restriction that had no matching business rule. The column stays smallint
-- (still bounds it to a sane numeric range) but no longer enforces a specific
-- century window at the DB level.

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_year_built_check;
