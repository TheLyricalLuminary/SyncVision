// BullMQ worker — processes Stripe events from webhookQueue.
//
// Job lifecycle:
//   webhookQueue → processor (up to 5 attempts, exponential backoff)
//   on permanent failure → dlqQueue (never silently discarded)
//
// All business logic is in webhookHandlers.ts so it can also be invoked
// directly in environments without Redis (dev/staging fallback).

import { Worker, Job } from "bullmq";
import { bullmqConnection } from "../lib/redisConnection";
import { WebhookJobData, DlqJobData, dlqQueue, WEBHOOK_QUEUE } from "./webhookQueue";
import { dispatchEvent } from "./webhookHandlers";

async function processor(job: Job<WebhookJobData>): Promise<void> {
  await dispatchEvent(job.data.type, job.data.data, job.data.id, "webhook");
}

export function startWebhookWorker(): (() => Promise<void>) | null {
  if (!bullmqConnection) {
    console.warn("[webhook-worker] Redis unavailable — worker disabled, fallback active");
    return null;
  }

  const worker = new Worker<WebhookJobData>(WEBHOOK_QUEUE, processor, {
    connection:  bullmqConnection,
    concurrency: 5,
    prefix:      process.env.QUEUE_PREFIX ?? "syncvision",
  });

  worker.on("completed", (job) => {
    console.log(`[webhook-worker] done job=${job.id} type=${job.data.type}`);
  });

  // On permanent failure (all attempts exhausted): push to DLQ, never discard.
  worker.on("failed", async (job: Job<WebhookJobData> | undefined, err: Error) => {
    if (!job) return;

    const maxAttempts  = job.opts.attempts ?? 1;
    const isLastAttempt = job.attemptsMade >= maxAttempts;

    console.error(
      `[webhook-worker] job=${job.id} type=${job.data.type} ` +
      `attempt=${job.attemptsMade}/${maxAttempts} err=${err.message}`
    );

    if (isLastAttempt && dlqQueue) {
      const dlqPayload: DlqJobData = {
        originalJobId: job.id,
        eventId:       job.data.id,
        type:          job.data.type,
        error:         err.message,
        stack:         err.stack,
        payload:       job.data,
        failedAt:      new Date().toISOString(),
      };

      await dlqQueue
        .add("dead-letter", dlqPayload, { removeOnComplete: false, removeOnFail: false })
        .catch((e) => console.error("[webhook-worker] DLQ push failed:", e));

      console.error(`[webhook-worker] DLQ: event ${job.data.id} after ${job.attemptsMade} attempts`);
    }
  });

  worker.on("error", (err) => {
    console.error("[webhook-worker] worker error:", err.message);
  });

  return async () => {
    await worker.close();
    console.log("[webhook-worker] closed");
  };
}
