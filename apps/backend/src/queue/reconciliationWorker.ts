// BullMQ worker for the reconciliationQueue.
//
// Processes events sourced from the reconciliation cron (missed webhooks,
// unprocessed ledger entries, Stripe replay events).
//
// Job lifecycle: reconciliationQueue → processor (10 attempts, exp backoff 5s)
//                on permanent failure → dlqQueue

import { Worker, Job } from "bullmq";
import { bullmqConnection } from "../lib/redisConnection";
import { ReconciliationJobData, RECONCILIATION_QUEUE } from "./reconciliationQueue";
import { dlqQueue, DlqJobData } from "./webhookQueue";
import { dispatchEvent } from "./webhookHandlers";
import { auditLog } from "../lib/auditLog";
import prisma from "../lib/prisma";
import { getStripe } from "../lib/stripe";

async function processor(job: Job<ReconciliationJobData>): Promise<void> {
  const { eventId, type, source } = job.data;

  // ── Guard: skip if already processed in ledger ──────────────────────────────
  const existing = await prisma.stripeEventLedger.findUnique({
    where: { id: eventId },
  });

  if (existing?.processed) {
    await auditLog("RECON_EVENT_SKIPPED", "SKIPPED", { eventId, type, source, reason: "already_processed" }, eventId);
    return;
  }

  // ── Upsert ledger entry (processed=false) before doing any work ─────────────
  await prisma.stripeEventLedger.upsert({
    where:  { id: eventId },
    update: { processingError: null },
    create: { id: eventId, type, source, processed: false },
  });

  // ── Resolve event data ───────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let eventData: any = job.data.data;

  if (!eventData) {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe client unavailable — cannot fetch event data");
    const fullEvent = await stripe.events.retrieve(eventId);
    eventData = fullEvent.data;
  }

  // ── Dispatch business logic ──────────────────────────────────────────────────
  try {
    await dispatchEvent(type, eventData);

    await prisma.stripeEventLedger.update({
      where: { id: eventId },
      data:  { processed: true, processedAt: new Date(), processingError: null },
    });

    await auditLog("LEDGER_MARKED_PROCESSED", "OK", { eventId, type, source, attempt: job.attemptsMade }, eventId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.stripeEventLedger.update({
      where: { id: eventId },
      data:  { processingError: msg },
    });
    await auditLog("LEDGER_PROCESSING_ERROR", "ERROR", { eventId, type, source, error: msg, attempt: job.attemptsMade }, eventId);
    throw err; // re-throw so BullMQ retries
  }
}

export function startReconciliationWorker(): (() => Promise<void>) | null {
  if (!bullmqConnection) {
    console.warn("[recon-worker] Redis unavailable — reconciliation worker disabled");
    return null;
  }

  const worker = new Worker<ReconciliationJobData>(
    RECONCILIATION_QUEUE,
    processor,
    { connection: bullmqConnection, concurrency: 3, prefix: process.env.QUEUE_PREFIX ?? "syncvision" },
  );

  worker.on("completed", (job) => {
    console.log(`[STRIPE_RECON] worker done job=${job.id} event=${job.data.eventId} type=${job.data.type}`);
  });

  worker.on("failed", async (job: Job<ReconciliationJobData> | undefined, err: Error) => {
    if (!job) return;

    const maxAttempts   = job.opts.attempts ?? 1;
    const isLastAttempt = job.attemptsMade >= maxAttempts;

    console.error(
      `[STRIPE_RECON] job=${job.id} event=${job.data.eventId} ` +
      `attempt=${job.attemptsMade}/${maxAttempts} err=${err.message}`
    );

    if (isLastAttempt && dlqQueue) {
      const payload: DlqJobData = {
        originalJobId: job.id,
        eventId:       job.data.eventId,
        type:          job.data.type,
        error:         err.message,
        stack:         err.stack,
        payload:       { id: job.data.eventId, type: job.data.type, data: job.data.data },
        failedAt:      new Date().toISOString(),
      };

      await dlqQueue
        .add("dead-letter", payload, { removeOnComplete: false, removeOnFail: false })
        .catch((e) => console.error("[STRIPE_DLQ] push failed:", e));

      await auditLog("DLQ_PUSH", "ERROR", {
        eventId:       job.data.eventId,
        type:          job.data.type,
        error:         err.message,
        attemptsMade:  job.attemptsMade,
      }, job.data.eventId);

      console.error(`[STRIPE_DLQ] event=${job.data.eventId} moved to DLQ after ${job.attemptsMade} attempts`);
    }
  });

  worker.on("error", (err) => {
    console.error("[recon-worker] worker error:", err.message);
  });

  return async () => {
    await worker.close();
    console.log("[recon-worker] closed");
  };
}
