// Repath the 3 original tracks (Never Letting Go, Where We Belong,
// Breaking Chains) from ~/Downloads/* to apps/backend/audio/* and clear
// their stale ConfidenceScore rows so the next /api/scores call
// regenerates a fresh inputHash.
//
// The audio file content hasn't changed, so DSP fields stay valid.

import "dotenv/config";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";

const AUDIO_DIR = path.resolve(__dirname, "../../audio");

const REPATH: Record<string, string> = {
  QZRP52418558: "NeverLettingGo.wav",
  QZTB72567824: "WhereWeBelong.wav",
  QZTB72565415: "BreakingChains.wav",
};

async function main() {
  for (const [isrc, filename] of Object.entries(REPATH)) {
    const newPath = path.join(AUDIO_DIR, filename);
    if (!fs.existsSync(newPath)) throw new Error(`File missing: ${newPath}`);

    const track = await prisma.track.findFirst({ where: { isrc } });
    if (!track) {
      console.warn(`Track with ISRC ${isrc} not found — skipping`);
      continue;
    }

    await prisma.track.update({
      where: { id: track.id },
      data: { audioFilePath: newPath },
    });

    // Drop the existing ConfidenceScore row — its inputHash was tied to the
    // old path. /api/scores will recompute a fresh hash on next request.
    await prisma.confidenceScore.deleteMany({ where: { trackId: track.id } });

    console.log(`  Repathed ${track.title.padEnd(20)} → ${newPath}`);
  }

  await prisma.$disconnect();
  console.log("\nRepath complete.\n");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
