// Structured audit logger — append-only writes to stripe_audit_log.
// Never throws: a logging failure must not interrupt business logic.

import { Prisma } from "@prisma/client";
import prisma from "./prisma";

export type AuditAction =
  | "WEBHOOK_RECEIVED"
  | "WEBHOOK_DUPLICATE"
  | "WEBHOOK_ENQUEUED"
  | "LEDGER_CREATED"
  | "LEDGER_MARKED_PROCESSED"
  | "LEDGER_PROCESSING_ERROR"
  | "ENTITLEMENT_UPGRADED"
  | "ENTITLEMENT_DOWNGRADED"
  | "ENTITLEMENT_NOOP"
  | "STRIPE_DRIFT_DETECTED"
  | "STRIPE_REPAIR_APPLIED"
  | "RECON_EVENT_FOUND"
  | "RECON_EVENT_REQUEUED"
  | "RECON_EVENT_SKIPPED"
  | "RECON_RUN_START"
  | "RECON_RUN_COMPLETE"
  | "RECON_RUN_ERROR"
  | "DLQ_PUSH"
  | "CREDITS_TOPPED_UP";

export async function auditLog(
  action:   AuditAction,
  result:   "OK" | "ERROR" | "NOOP" | "SKIPPED",
  metadata: Record<string, unknown>,
  eventId?: string,
): Promise<void> {
  await prisma.stripeAuditLog
    .create({
      data: {
        id:       `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action,
        result,
        metadata: metadata as Prisma.InputJsonValue,
        eventId:  eventId ?? null,
      },
    })
    .catch((err) =>
      console.error(`[AUDIT] Failed to write audit log action=${action}:`, err)
    );
}
