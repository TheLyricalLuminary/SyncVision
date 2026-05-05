import "dotenv/config";
import redis from "../lib/redis";
import prisma from "../lib/prisma";

const STREAM = "syncvision:analysis";

export async function enqueueTrack(trackId: string): Promise<void> {
  if (!redis) throw new Error("Redis not configured — REDIS_URL is required to enqueue tracks");

  const track = await prisma.track.findUnique({ where: { id: trackId } });
  if (!track) throw new Error(`Track not found: ${trackId}`);

  await prisma.track.update({
    where: { id: trackId },
    data: { trackStatus: "queued" },
  });

  await redis.xadd(STREAM, "*", "trackId", trackId, "enqueuedAt", new Date().toISOString());
}
