import "dotenv/config";
import prisma from "./src/lib/prisma";
import { calculateConfidenceScore } from "./src/scoring/confidenceScore";

(async () => {
  const id = "cmojfhtnt00004y9knebb3u3x";
  const track = await prisma.track.findUnique({ where: { id }, include: { rightsProfile: true } });
  const stored = await prisma.confidenceScore.findUnique({ where: { trackId: id } });

  if (!track) { console.log("NO TRACK FOUND"); process.exit(1); }

  console.log("=== TRACK ROW ===");
  console.log(JSON.stringify({
    id: track.id, title: track.title, isrc: track.isrc, tempo: track.tempo,
    tonalCharacter: track.tonalCharacter, energyCharacter: track.energyCharacter,
    audioFilePath: track.audioFilePath, trackStatus: track.trackStatus,
    artistName: track.artistName, errorReason: track.errorReason, timeline: track.timeline,
  }, null, 2));

  console.log("\n=== RIGHTS PROFILE ===");
  console.log(JSON.stringify(track.rightsProfile, null, 2));

  console.log("\n=== STORED SCORE ROW ===");
  console.log(JSON.stringify(stored, null, 2));

  if (!track.rightsProfile) { console.log("NO RIGHTS PROFILE"); process.exit(2); }

  // Recompute hash NOW with current data
  const recomputed = calculateConfidenceScore(track as any, track.rightsProfile as any);
  console.log("\n=== RECOMPUTED ===");
  console.log("recomputed inputHash =", recomputed.inputHash);
  console.log("recomputed score     =", recomputed.score);

  if (stored) {
    console.log("\n=== HASH COMPARISON ===");
    console.log("stored   =", stored.inputHash);
    console.log("current  =", recomputed.inputHash);
    console.log("match    =", stored.inputHash === recomputed.inputHash);
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
