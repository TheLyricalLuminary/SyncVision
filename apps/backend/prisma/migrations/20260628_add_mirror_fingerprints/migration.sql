-- Mirror Fingerprint table for the Mirror Workflow temp-track replacement feature.
--
-- Stores per-track deterministic fingerprints derived from analyze_v2.py's
-- forensicTimeline output.  One row per track; upserted on re-fingerprinting.
--
-- coarseEnvelope  — 16-bin mean-per-chunk per band, used for fast pre-filter
-- bandStats       — mean/std/p10/p50/p90 per band
-- fullTimeline    — complete ForensicTimeline (subZero, zeroPocketZone,
--                   presence, highFidelityAir, cmamTension arrays)
-- inputHash       — SHA-256 of the audio file bytes; matches Track.timeline.inputHash
-- modelVersion    — analyze_v2.py MODEL_VERSION (e.g. "2.0.0-phase1")

CREATE TABLE "scoring"."mirror_fingerprints" (
    "id"              TEXT NOT NULL,
    "trackId"         TEXT NOT NULL,
    "coarseEnvelope"  JSONB NOT NULL,
    "bandStats"       JSONB NOT NULL,
    "fullTimeline"    JSONB NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "frameCount"      INTEGER NOT NULL,
    "fps"             INTEGER NOT NULL,
    "inputHash"       TEXT NOT NULL,
    "modelVersion"    TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mirror_fingerprints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mirror_fingerprints_trackId_key"
    ON "scoring"."mirror_fingerprints"("trackId");

ALTER TABLE "scoring"."mirror_fingerprints"
    ADD CONSTRAINT "mirror_fingerprints_trackId_fkey"
    FOREIGN KEY ("trackId")
    REFERENCES "scoring"."ScoringTrack"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
