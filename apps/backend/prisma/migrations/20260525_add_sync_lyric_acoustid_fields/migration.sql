-- Add sync/lyric license fields to RightsProfile
ALTER TABLE scoring."RightsProfile"
  ADD COLUMN IF NOT EXISTS "syncLicenseStatus"  TEXT,
  ADD COLUMN IF NOT EXISTS "syncLicensedBy"      TEXT,
  ADD COLUMN IF NOT EXISTS "lyricLicenseStatus"  TEXT,
  ADD COLUMN IF NOT EXISTS "lyricLicensedBy"     TEXT;

-- Add AcoustID identity fields to Track
ALTER TABLE public."Track"
  ADD COLUMN IF NOT EXISTS "acoustidId"          TEXT,
  ADD COLUMN IF NOT EXISTS "acoustidScore"        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "acoustidCheckedAt"    TIMESTAMPTZ;

-- Make ISRC nullable (was required at ingestion, now resolved async)
ALTER TABLE public."Track"
  ALTER COLUMN "isrc" DROP NOT NULL;
