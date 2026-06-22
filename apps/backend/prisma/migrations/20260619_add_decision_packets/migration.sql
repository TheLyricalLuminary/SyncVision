-- CreateTable
CREATE TABLE IF NOT EXISTS "scoring"."decision_packets" (
    "id" TEXT NOT NULL,
    "packetVersion" TEXT NOT NULL DEFAULT '1',
    "scoringVersion" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "briefText" TEXT NOT NULL,
    "sceneParams" JSONB NOT NULL,
    "tracks" JSONB NOT NULL,
    "packetHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "director_decisions" JSONB,

    CONSTRAINT "decision_packets_pkey" PRIMARY KEY ("id")
);
