ALTER TABLE scoring."RightsProfile"
  ADD COLUMN IF NOT EXISTS "workId"           TEXT,
  ADD COLUMN IF NOT EXISTS "genreTags"        TEXT[],
  ADD COLUMN IF NOT EXISTS "popularityScore"  INTEGER,
  ADD COLUMN IF NOT EXISTS "enrichmentStatus" TEXT DEFAULT 'pending';
