// Stripe reconciliation cron — runs every 15 minutes.
//
// PURPOSE: Recover missed webhooks, failed workers, replay drift, and
// Stripe ↔ local state inconsistency.
//
// ALGORITHM (per run):
//   1. Acquire Redis lock — only one instance executes per interval.
//   2. Fetch Stripe events from last 72 h for critical event types.
//   3. Also fetch events with delivery_success=false (missed deliveries).
//   4. For each event:
//      CASE A — ledger processed=true  → SKIP
//      CASE B — ledger processed=false → REQUEUE to reconciliationQueue
//      CASE C — ledger missing         → INSERT + ENQUEUE
//   5. Validate Stripe ↔ local state for all users with stripeCustomerId.
//   6. Auto-repair any detected drift.
//   7. Release lock.
//
// FAILURE SAFETY: Errors are caught and logged — reconciliation failure
// must never crash the API server or propagate to Stripe.

import cron from "node-cron";
import redis from "../lib/redis";
import prisma from "../lib/prisma";
import { getStripe } from "../lib/stripe";
import { reconciliationQueue } from "../queue/reconciliationQueue";
import { auditLog } from "../lib/auditLog";
import { validateStripeState, repairDrift } from "../services/stripeConsistency";

const LOCK_KEY      = "stripe:recon:lock";
const LOCK_TTL_S    = 14 * 60;          // 14 min — releases before next 15-min tick
const WINDOW_MS     = 72 * 60 * 60 * 1000;
const CRITICAL_TYPES = [
  "checkout.session.completed",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

// Job options for reconciliation queue — more attempts than webhook path
// because these events are already known to have had delivery issues.
const JOB_OPTIONS = {
  attempts:        10,
  backoff:         { type: "exponential" as const, delay: 5000 },
  removeOnComplete: true,
  removeOnFail:    false,
};

async function acquireLock(): Promise<boolean> {
  if (!redis) return true; // no Redis → allow (single-instance implied)
  const result = await redis.set(LOCK_KEY, "1", "EX", LOCK_TTL_S, "NX");
  return result === "OK";
}

async function releaseLock(): Promise<void> {
  if (redis) await redis.del(LOCK_KEY).catch(() => undefined);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enqueueIfNeeded(event: any, source: "missed_delivery" | "critical_window"): Promise<void> {
  const existing = await prisma.stripeEventLedger.findUnique({ where: { id: event.id } });

  if (existing?.processed) {
    // Case A — already processed: skip
    await auditLog("RECON_EVENT_SKIPPED", "SKIPPED", { eventId: event.id, type: event.type, source, reason: "already_processed", tag: "[STRIPE_RECON]" }, event.id);
    return;
  }

  if (existing && !existing.processed) {
    // Case B — ledger exists but not processed: requeue
    if (reconciliationQueue) {
      await reconciliationQueue.add(event.type, {
        eventId: event.id, type: event.type, source: "reconciliation", data: event.data,
      }, JOB_OPTIONS);
    }
    await auditLog("RECON_EVENT_REQUEUED", "OK", { eventId: event.id, type: event.type, source, tag: "[STRIPE_RECON]" }, event.id);
    console.log(`[STRIPE_RECON] REQUEUED event=${event.id} type=${event.type}`);
    return;
  }

  // Case C — not in ledger: insert + enqueue
  await prisma.stripeEventLedger
    .create({ data: { id: event.id, type: event.type, source: "reconciliation", processed: false } })
    .catch(() => undefined); // safe to ignore unique violation (concurrent run)

  if (reconciliationQueue) {
    await reconciliationQueue.add(event.type, {
      eventId: event.id, type: event.type, source: "reconciliation", data: event.data,
    }, JOB_OPTIONS);
  }

  await auditLog("RECON_EVENT_FOUND", "OK", { eventId: event.id, type: event.type, source, tag: "[STRIPE_RECON]" }, event.id);
  console.log(`[STRIPE_RECON] ENQUEUED missed event=${event.id} type=${event.type}`);
}

async function reconcileEvents(): Promise<{ processed: number; requeued: number; errors: number }> {
  const stripe = getStripe();
  if (!stripe) {
    console.warn("[STRIPE_RECON] Stripe unavailable — skipping event reconciliation");
    return { processed: 0, requeued: 0, errors: 0 };
  }

  const since     = Math.floor((Date.now() - WINDOW_MS) / 1000);
  let processed   = 0;
  let errors      = 0;

  // ── Fetch missed deliveries (Stripe could not deliver to our endpoint) ───────
  try {
    const missed = await stripe.events.list({
      limit:            100,
      delivery_success: false,
      created:          { gte: since },
    } as Parameters<typeof stripe.events.list>[0]);

    for (const event of missed.data) {
      await enqueueIfNeeded(event, "missed_delivery").catch((e) => {
        errors++;
        console.error(`[STRIPE_RECON] enqueue failed event=${event.id}:`, e);
      });
      processed++;
    }
  } catch (e) {
    console.error("[STRIPE_RECON] Failed to fetch missed events:", e);
    errors++;
  }

  // ── Fetch critical event types from last 72 h (belt-and-suspenders) ──────────
  for (const type of CRITICAL_TYPES) {
    try {
      const events = await stripe.events.list({ limit: 100, type, created: { gte: since } });
      for (const event of events.data) {
        await enqueueIfNeeded(event, "critical_window").catch((e) => {
          errors++;
          console.error(`[STRIPE_RECON] enqueue failed event=${event.id}:`, e);
        });
        processed++;
      }
    } catch (e) {
      console.error(`[STRIPE_RECON] Failed to fetch ${type} events:`, e);
      errors++;
    }
  }

  return { processed, requeued: processed, errors };
}

async function reconcileConsistency(): Promise<{ checked: number; repaired: number; errors: number }> {
  const users = await prisma.user.findMany({
    where:  { stripeCustomerId: { not: null } },
    select: { id: true },
  });

  let checked  = 0;
  let repaired = 0;
  let errors   = 0;

  for (const { id } of users) {
    try {
      const result = await validateStripeState(id);
      checked++;

      if (result.consistent === false) {
        await auditLog("STRIPE_DRIFT_DETECTED", "ERROR", {
          userId: id, driftType: result.driftType,
          localState: result.localState, stripeState: result.stripeState,
          tag: "[STRIPE_DRIFT]",
        });
        console.warn(`[STRIPE_DRIFT] userId=${id} drift=${result.driftType}`);

        await repairDrift(result);
        repaired++;
      }
    } catch (e) {
      errors++;
      console.error(`[STRIPE_RECON] consistency check failed userId=${id}:`, e);
    }
  }

  return { checked, repaired, errors };
}

async function runReconciliation(): Promise<void> {
  const runId = Date.now().toString(36);
  console.log(`[STRIPE_RECON] run=${runId} starting`);
  await auditLog("RECON_RUN_START", "OK", { runId, tag: "[STRIPE_RECON]" });

  try {
    const [evtStats, csStats] = await Promise.all([
      reconcileEvents(),
      reconcileConsistency(),
    ]);

    await auditLog("RECON_RUN_COMPLETE", "OK", {
      runId,
      eventsProcessed: evtStats.processed,
      eventErrors:     evtStats.errors,
      usersChecked:    csStats.checked,
      usersRepaired:   csStats.repaired,
      consistencyErrors: csStats.errors,
      tag: "[STRIPE_RECON]",
    });

    console.log(
      `[STRIPE_RECON] run=${runId} done — ` +
      `events=${evtStats.processed} errs=${evtStats.errors} | ` +
      `users checked=${csStats.checked} repaired=${csStats.repaired}`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await auditLog("RECON_RUN_ERROR", "ERROR", { runId, error: msg, tag: "[STRIPE_RECON]" });
    console.error(`[STRIPE_RECON] run=${runId} FAILED:`, e);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function startReconciliationCron(): void {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("[STRIPE_RECON] STRIPE_SECRET_KEY not set — cron disabled");
    return;
  }

  if (process.env.ENABLE_STRIPE_RECONCILIATION !== "true") {
    console.warn("[STRIPE_RECON] ENABLE_STRIPE_RECONCILIATION != true — cron disabled");
    return;
  }

  const intervalMinutes = parseInt(process.env.STRIPE_RECON_INTERVAL_MINUTES ?? "15", 10);
  const cronExpr = `*/${intervalMinutes} * * * *`;

  cron.schedule(cronExpr, async () => {
    const acquired = await acquireLock();
    if (!acquired) {
      console.log("[STRIPE_RECON] lock held by another instance — skipping tick");
      return;
    }

    try {
      await runReconciliation();
    } finally {
      await releaseLock();
    }
  });

  console.log(`[STRIPE_RECON] cron scheduled: every ${intervalMinutes} minutes`);
}

// Exported for testing / manual trigger
export { runReconciliation };
