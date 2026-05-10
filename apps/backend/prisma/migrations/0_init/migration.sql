◇ injected env (9) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "scoring";

-- CreateTable
CREATE TABLE "scoring"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "planLevel" TEXT NOT NULL DEFAULT 'COMPOSER',
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring"."Catalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring"."CatalogMember" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "CatalogMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring"."ScoringTrack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT,
    "isrc" TEXT NOT NULL,
    "trackStatus" TEXT NOT NULL DEFAULT 'uploaded',
    "audioFilePath" TEXT,
    "timeline" JSONB,
    "errorReason" TEXT,
    "tempo" DOUBLE PRECISION,
    "tonalCharacter" TEXT,
    "energyCharacter" TEXT,
    "modelVersion" TEXT,
    "spectralCentroid" DOUBLE PRECISION,
    "rmsEnergy" DOUBLE PRECISION,
    "zeroCrossingRate" DOUBLE PRECISION,
    "catalogId" TEXT,

    CONSTRAINT "ScoringTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring"."RightsProfile" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "ascapWorkId" TEXT,
    "bmiWorkId" TEXT,
    "masterOwnershipPct" DECIMAL(65,30),
    "isOneStop" BOOLEAN,
    "writerName" TEXT,
    "writerIpi" TEXT,
    "publisherName" TEXT,
    "proAffiliation" TEXT,
    "masterOwnedBy" TEXT,
    "masterOwnershipType" TEXT,
    "masterVerifiedAt" TIMESTAMP(3),
    "masterOwnershipSplits" JSONB,

    CONSTRAINT "RightsProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring"."ConfidenceScore" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidenceLabel" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "rightsBreakdown" INTEGER NOT NULL,
    "metaBreakdown" INTEGER NOT NULL,
    "audioBreakdown" INTEGER NOT NULL,
    "sceneFitBreakdown" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hashVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ConfidenceScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring"."stripe_events" (
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "scoring"."user_trials" (
    "trialToken" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "tracksUsed" INTEGER NOT NULL DEFAULT 0,
    "scenesUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_trials_pkey" PRIMARY KEY ("trialToken")
);

-- CreateTable
CREATE TABLE "scoring"."stripe_event_ledger" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processingError" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "stripe_event_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring"."stripe_audit_log" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "scoring"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogMember_catalogId_userId_key" ON "scoring"."CatalogMember"("catalogId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringTrack_catalogId_isrc_key" ON "scoring"."ScoringTrack"("catalogId", "isrc");

-- CreateIndex
CREATE UNIQUE INDEX "RightsProfile_trackId_key" ON "scoring"."RightsProfile"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfidenceScore_trackId_key" ON "scoring"."ConfidenceScore"("trackId");

-- CreateIndex
CREATE INDEX "stripe_event_ledger_processed_idx" ON "scoring"."stripe_event_ledger"("processed");

-- CreateIndex
CREATE INDEX "stripe_event_ledger_type_idx" ON "scoring"."stripe_event_ledger"("type");

-- CreateIndex
CREATE INDEX "stripe_audit_log_eventId_idx" ON "scoring"."stripe_audit_log"("eventId");

-- CreateIndex
CREATE INDEX "stripe_audit_log_action_idx" ON "scoring"."stripe_audit_log"("action");

-- AddForeignKey
ALTER TABLE "scoring"."Catalog" ADD CONSTRAINT "Catalog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "scoring"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring"."CatalogMember" ADD CONSTRAINT "CatalogMember_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "scoring"."Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring"."CatalogMember" ADD CONSTRAINT "CatalogMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "scoring"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring"."ScoringTrack" ADD CONSTRAINT "ScoringTrack_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "scoring"."Catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring"."RightsProfile" ADD CONSTRAINT "RightsProfile_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "scoring"."ScoringTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring"."ConfidenceScore" ADD CONSTRAINT "ConfidenceScore_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "scoring"."ScoringTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

