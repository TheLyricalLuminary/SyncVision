import "dotenv/config";
import { createHash } from "crypto";
import prisma from "./src/lib/prisma";
import { calculateConfidenceScore } from "./src/scoring/confidenceScore";

(async () => {
  const tracks = await prisma.track.findMany({
    include: { rightsProfile: true, confidenceScore: true },
  });

  const stale: string[] = [];
  const matching: string[] = [];

  for (const track of tracks) {
    const { rightsProfile: rp, confidenceScore: cs, ...trackScalars } = track;
    if (!cs) continue;
    const result = calculateConfidenceScore(trackScalars, rp ?? {});
    if (cs.inputHash !== result.inputHash) {
      stale.push(`${track.id} (${track.title}) stored=${cs.inputHash.slice(0,12)} current=${result.inputHash.slice(0,12)}`);
    } else {
      matching.push(`${track.id} (${track.title})`);
    }
  }

  console.log(`MATCHING (${matching.length}):`);
  matching.forEach(s => console.log("  " + s));
  console.log(`\nSTALE (${stale.length}):`);
  stale.forEach(s => console.log("  " + s));

  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
