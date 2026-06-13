-- Catch-up: add columns present in schema but never included in a prior migration.
-- All statements use IF NOT EXISTS so this is safe to re-run on any environment.

ALTER TABLE scoring."ScoringTrack"
  ADD COLUMN IF NOT EXISTS "isSynthetic"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "processedAt"      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "confidence"       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "lyricsText"       TEXT,
  ADD COLUMN IF NOT EXISTS "lyricsState"      TEXT,
  ADD COLUMN IF NOT EXISTS "lyricsSource"     TEXT;
