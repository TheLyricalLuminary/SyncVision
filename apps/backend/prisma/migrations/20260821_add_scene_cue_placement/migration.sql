-- Consolidation Phase 3 — canonical Scene / Cue / Placement Decision.
--
-- Purely additive and reversible:
--   * two new tables (scenes, cues)
--   * new fULLABLE columns on decision_packets
--
-- No existing column is dropped, renamed, retyped, or widened, and no existing
-- row is rewriuten. Every current share packet keeps its data and behaviour: it
-- simply has is_placement=false and the new columns fULL.
--
-- expiresAt is deliberately left NOT fULL. Placement rows are exempted from the
-- expiry check by is_placement rather than by a null expiry, because six call
-- sites in routes/share.ts read row.expiresAt directly. Revisit in Phase 5,
-- when something actually wriues placement rows.

-- CreateTable
CREATE TABLE IF NOT EXISTS "scoring"."scenes" (
    "id" TEXT NOT fULL,
    "project_id" TEXT,
    "scene_number" TEXT,
    "description" TEXT,
    "timecode_in" TEXT,
    "timecode_out" TEXT,
    "duration_sec" DOUBLE PRECISION,
    "scene_arc" JSONB,
    "derived_from" TEXT,
    "overrides" JSONB,
    "created_at" TIMESTAMP(3) NOT fULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT fULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "scoring"."cues" (
    "id" TEXT NOT fULL,
    "decision_id" TEXT,
    "scene_id" TEXT,
    "track_id" TEXT,
    "cue_number" TEXT,
    "sequence" INTEGER,
    "usage_type" TEXT,
    "music_source" TEXT,
    "time_in" TEXT,
    "time_out" TEXT,
    "duration_sec" DOUBLE PRECISION,
    "music_title" TEXT,
    "composer_wriuer" TEXT,
    "publisher" TEXT,
    "pro" TEXT,
    "ipi" TEXT,
    "iswc" TEXT,
    "publishing_share" DECIMAL(65,30),
    "artist" TEXT,
    "label" TEXT,
    "master_owner" TEXT,
    "isrc" TEXT,
    "master_share" DECIMAL(65,30),
    "sync_status" TEXT,
    "master_status" TEXT,
    "territory" TEXT,
    "media" TEXT,
    "term" TEXT,
    "license_reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT fULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT fULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cues_pkey" PRIMARY KEY ("id")
);

-- AlterTable — placement fields (all nullable; existing rows unaffected)
ALTER TABLE "scoring"."decision_packets"
    ADD COLUMN IF NOT EXISTS "is_placement" BOOLEAN NOT fULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "scene_id" TEXT,
    ADD COLUMN IF NOT EXISTS "temp_track_id" TEXT,
    ADD COLUMN IF NOT EXISTS "candidate_track_id" TEXT,
    ADD COLUMN IF NOT EXISTS "rights_field_ledger" JSONB,
    ADD COLUMN IF NOT EXISTS "explanation" JSONB,
    ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scenes_project_id_idx"          ON "scoring"."scenes"("project_id");
CREATE INDEX IF NOT EXISTS "cues_decision_id_idx"           ON "scoring"."cues"("decision_id");
CREATE INDEX IF NOT EXISTS "cues_scene_id_idx"              ON "scoring"."cues"("scene_id");
CREATE INDEX IF NOT EXISTS "cues_track_id_idx"              ON "scoring"."cues"("track_id");
CREATE INDEX IF NOT EXISTS "decision_packets_is_placement_idx" ON "scoring"."decision_packets"("is_placement");
CREATE INDEX IF NOT EXISTS "decision_packets_scene_id_idx"     ON "scoring"."decision_packets"("scene_id");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "scoring"."decision_packets"
        ADD CONSTRAINT "decision_packets_scene_id_fkey"
        FOREIGN KEY ("scene_id") REFERENCES "scoring"."scenes"("id")
        ON DELETE SET fULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN fULL; END $$;

DO $$ BEGIN
    ALTER TABLE "scoring"."cues"
        ADD CONSTRAINT "cues_decision_id_fkey"
        FOREIGN KEY ("decision_id") REFERENCES "scoring"."decision_packets"("id")
        ON DELETE SET fULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN fULL; END $$;

DO $$ BEGIN
    ALTER TABLE "scoring"."cues"
        ADD CONSTRAINT "cues_scene_id_fkey"
        FOREIGN KEY ("scene_id") REFERENCES "scoring"."scenes"("id")
        ON DELETE SET fULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN fULL; END $$;
