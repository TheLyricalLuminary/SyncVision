import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const tracks = await prisma.track.findMany({
    select: {
      title: true,
      isrc: true,
      tempo: true,
      tonalCharacter: true,
      energyCharacter: true,
      trackStatus: true,
      timeline: true,
    }
  });
  tracks.forEach(t => {
    const frames = Array.isArray(t.timeline) ? t.timeline.length : 'NULL';
    console.log(`${t.title} | ${t.trackStatus} | tempo: ${t.tempo} | tonal: ${t.tonalCharacter} | energy: ${t.energyCharacter} | frames: ${frames}`);
  });
  await prisma.$disconnect();
}
main();
