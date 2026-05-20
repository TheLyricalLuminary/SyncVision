// One-time migration: strip any directory prefix from track.audioFilePath,
// leaving only the bare filename (e.g. "EndlessSky.wav").
// Safe to re-run — paths that are already bare filenames are left unchanged.

import "dotenv/config";
import path from "path";
import prisma from "../lib/prisma";

async function main() {
  const tracks = await prisma.track.findMany({
    select: { id: true, title: true, audioFilePath: true },
  });

  let updated = 0;
  for (const track of tracks) {
    if (!track.audioFilePath) continue;
    const bare = path.basename(track.audioFilePath);
    if (bare === track.audioFilePath) continue; // already a bare filename

    await prisma.track.update({
      where: { id: track.id },
      data: { audioFilePath: bare },
    });
    console.log(`  ${track.title.padEnd(25)} ${track.audioFilePath} → ${bare}`);
    updated++;
  }

  console.log(`\nDone. Updated ${updated} of ${tracks.length} tracks.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
