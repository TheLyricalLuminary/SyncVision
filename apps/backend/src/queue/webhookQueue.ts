import { Queue } from "bullmq";
import { bullmqConnection } from "../lib/redisConnection";

export interface WebhookJobData {
  id:   string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export interface DlqJobData {
  originalJobId: string | undefined;
  eventId:       string;
  type:          string;
  error:         string;
  stack:         string | undefined;
  payload:       WebhookJobData;
  failedAt:      string;
}

// QUEUE_PREFIX namespaces all BullMQ Redis keys — prevents cross-env collisions.
// Use syncvision:local / syncvision:staging / syncvision:prod
const QUEUE_PREFIX = process.env.QUEUE_PREFIX ?? "syncvision";

export const WEBHOOK_QUEUE = "webhookQueue";
export const DLQ_QUEUE     = "dlqQueue";

// Queues are null when Redis is unavailable — callers must handle both cases.
export const webhookQueue = bullmqConnection
  ? new Queue<WebhookJobData>(WEBHOOK_QUEUE, { connection: bullmqConnection, prefix: QUEUE_PREFIX })
  : null;

export const dlqQueue = bullmqConnection
  ? new Queue<DlqJobData>(DLQ_QUEUE, { connection: bullmqConnection, prefix: QUEUE_PREFIX })
  : null;
