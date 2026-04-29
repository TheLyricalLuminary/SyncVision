import "dotenv/config";
import redis from "../lib/redis";
import prisma from "../lib/prisma";

const STREAM = "syncvision:analysis";

export async function enqueueTrack(trackId: string): Promise<void> {
  const track = await prisma.track.findUnique({ where: { id: trackId } });
  if (!track) throw new Error(`Track not found: ${trackId}`);

  await redis.xadd(STREAM, "*", "trackId", trackId, "enqueuedAt", new Date().toISOString());

  await prisma.track.update({
    where: { id: trackId },
    data: { trackStatus: "queued" },
  });
}
