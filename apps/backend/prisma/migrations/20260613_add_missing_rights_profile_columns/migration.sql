-- Catch-up: add RightsProfile columns present in schema but missing from prior migrations.
-- All statements use IF NOT EXISTS so this is safe to re-run on any environment.

ALTER TABLE scoring."RightsProfile"
  ADD COLUMN IF NOT EXISTS "splitPct"             DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "rightsState"          TEXT,
  ADD COLUMN IF NOT EXISTS "rightsLastCheckedAt"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "syncLicenseStatus"    TEXT,
  ADD COLUMN IF NOT EXISTS "syncLicensedBy"       TEXT,
  ADD COLUMN IF NOT EXISTS "lyricLicenseStatus"   TEXT,
  ADD COLUMN IF NOT EXISTS "lyricLicensedBy"      TEXT,
  ADD COLUMN IF NOT EXISTS "enrichmentSources"    TEXT[],
  ADD COLUMN IF NOT EXISTS "enrichedAt"           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "territory"            TEXT,
  ADD COLUMN IF NOT EXISTS "explicitFlag"         BOOLEAN,
  ADD COLUMN IF NOT EXISTS "workId"               TEXT,
  ADD COLUMN IF NOT EXISTS "genreTags"            TEXT[],
  ADD COLUMN IF NOT EXISTS "popularityScore"      INTEGER,
  ADD COLUMN IF NOT EXISTS "enrichmentStatus"     TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "iswc"                 TEXT,
  ADD COLUMN IF NOT EXISTS "workMbid"             TEXT,
  ADD COLUMN IF NOT EXISTS "rightsFieldSources"   JSONB;
