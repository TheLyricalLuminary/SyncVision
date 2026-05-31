-- Add ISWC, workMbid, and rightsFieldSources to RightsProfile.
--
-- iswc             — ISWC code from Credits.fm, MusicBrainz, or MLC.
-- workMbid         — MusicBrainz work MBID for the composition.
-- rightsFieldSources — JSON map of field → [{value, source}] storing every
--                     source's value independently so share.ts can surface
--                     CONFLICT entries in the decision-packet ledger.

ALTER TABLE "scoring"."RightsProfile"
  ADD COLUMN IF NOT EXISTS "iswc"               TEXT,
  ADD COLUMN IF NOT EXISTS "workMbid"            TEXT,
  ADD COLUMN IF NOT EXISTS "rightsFieldSources"  JSONB;
