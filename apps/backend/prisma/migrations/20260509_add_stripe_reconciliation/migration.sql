-- Migration: add_stripe_reconciliation
-- Adds: stripeCustomerId on User, StripeEventLedger, StripeAuditLog

-- Add Stripe customer ID to User (nullable, backward-compatible)
ALTER TABLE "scoring"."User" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

-- Full processing audit trail for Stripe events.
-- id = Stripe event.id (PK ensures exactly-once ledger entry per event).
CREATE TABLE IF NOT EXISTS "scoring"."stripe_event_ledger" (
    "id"              TEXT        NOT NULL,
    "type"            TEXT        NOT NULL,
    "processed"       BOOLEAN     NOT NULL DEFAULT false,
    "processingError" TEXT,
    "source"          TEXT        NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt"     TIMESTAMP(3),

    CONSTRAINT "stripe_event_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stripe_event_ledger_processed_idx" ON "scoring"."stripe_event_ledger"("processed");
CREATE INDEX IF NOT EXISTS "stripe_event_ledger_type_idx"      ON "scoring"."stripe_event_ledger"("type");

-- Immutable audit log — append-only, never mutated.
CREATE TABLE IF NOT EXISTS "scoring"."stripe_audit_log" (
    "id"        TEXT        NOT NULL,
    "eventId"   TEXT,
    "action"    TEXT        NOT NULL,
    "result"    TEXT        NOT NULL,
    "metadata"  JSONB       NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stripe_audit_log_eventId_idx" ON "scoring"."stripe_audit_log"("eventId");
CREATE INDEX IF NOT EXISTS "stripe_audit_log_action_idx"  ON "scoring"."stripe_audit_log"("action");
