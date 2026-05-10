import { Queue } from "bullmq";
import { bullmqConnection } from "../lib/redisConnection";

export interface ReconciliationJobData {
  eventId: string;
  type:    string;
  source:  "reconciliation";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?:   any;  // Stripe event.data — included to avoid extra API call in worker
}

const QUEUE_PREFIX = process.env.QUEUE_PREFIX ?? "syncvision";

export const RECONCILIATION_QUEUE = "reconciliationQueue";

export const reconciliationQueue = bullmqConnection
  ? new Queue<ReconciliationJobData>(RECONCILIATION_QUEUE, {
      connection: bullmqConnection,
      prefix:     QUEUE_PREFIX,
    })
  : null;
