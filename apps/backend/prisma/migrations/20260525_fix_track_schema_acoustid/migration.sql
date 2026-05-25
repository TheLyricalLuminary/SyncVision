-- Fix: previous migration used wrong table name — Track model maps to ScoringTrack.
-- These are idempotent — safe to run even if columns already exist.

ALTER TABLE scoring."ScoringTrack"
  ADD COLUMN IF NOT EXISTS "acoustidId"         TEXT,
  ADD COLUMN IF NOT EXISTS "acoustidScore"       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "acoustidCheckedAt"   TIMESTAMPTZ;

ALTER TABLE scoring."ScoringTrack"
  ALTER COLUMN "isrc" DROP NOT NULL;
