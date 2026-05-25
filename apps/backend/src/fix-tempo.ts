import prisma from "./lib/prisma";

// Tempo values captured from the process-audio run
const TEMPO_BY_ISRC: Record<string, number> = {
  QZRP52418558: 103.36, // Never Letting Go
  QZTB72567824: 112.35, // Where We Belong
  QZTB72565415: 107.67, // Breaking Chains
};

async function main() {
  const tracks = await prisma.track.findMany();
  for (const track of tracks) {
    const tempo = track.isrc ? TEMPO_BY_ISRC[track.isrc] : undefined;
    if (tempo === undefined) continue;
    await prisma.track.update({ where: { id: track.id }, data: { tempo } });
    console.log(`Set tempo for ${track.title}: ${tempo} BPM`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
