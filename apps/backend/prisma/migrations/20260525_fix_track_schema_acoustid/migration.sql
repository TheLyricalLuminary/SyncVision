-- Fix: previous migration used public."Track" but all tables are in scoring schema.
-- These are idempotent — safe to run even if columns already exist.

ALTER TABLE scoring."Track"
  ADD COLUMN IF NOT EXISTS "acoustidId"         TEXT,
  ADD COLUMN IF NOT EXISTS "acoustidScore"       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "acoustidCheckedAt"   TIMESTAMPTZ;

ALTER TABLE scoring."Track"
  ALTER COLUMN "isrc" DROP NOT NULL;
