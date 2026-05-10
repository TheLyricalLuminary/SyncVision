// BullMQ connection options — separate from the ioredis Streams client.
// BullMQ creates its own internal IORedis instance from these options.
// maxRetriesPerRequest: null is required by BullMQ.

import type { ConnectionOptions } from "bullmq";

export const bullmqConnection: ConnectionOptions | null = process.env.REDIS_URL
  ? {
      url:                  process.env.REDIS_URL,
      maxRetriesPerRequest: null,
      enableReadyCheck:     false,
    }
  : null;
