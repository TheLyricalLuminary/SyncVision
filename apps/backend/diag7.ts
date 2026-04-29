import "dotenv/config";
import prisma from "./src/lib/prisma";
import { calculateConfidenceScore } from "./src/scoring/confidenceScore";

(async () => {
  const tracks = await prisma.track.findMany({
    include: { rightsProfile: true, confidenceScore: true },
  });

  const staleIds: string[] = [];
  for (const track of tracks) {
    const { rightsProfile: rp, confidenceScore: cs, ...trackScalars } = track;
    if (!cs) continue;
    const result = calculateConfidenceScore(trackScalars, rp ?? {});
    if (cs.inputHash !== result.inputHash) staleIds.push(track.id);
  }

  console.log(`Deleting ${staleIds.length} stale ConfidenceScore row(s):`);
  for (const id of staleIds) console.log("  - " + id);

  if (staleIds.length > 0) {
    const result = await prisma.confidenceScore.deleteMany({
      where: { trackId: { in: staleIds } },
    });
    console.log(`Deleted ${result.count} row(s).`);
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
