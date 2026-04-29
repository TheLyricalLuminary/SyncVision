import prisma from "./lib/prisma";

// Artist name is the same as writerName for these tracks — one-stop, same person
async function main() {
  const tracks = await prisma.track.findMany({ include: { rightsProfile: true } });
  for (const track of tracks) {
    const artist = track.rightsProfile?.writerName ?? null;
    await prisma.track.update({ where: { id: track.id }, data: { artistName: artist } });
    console.log(`Set artistName for "${track.title}": ${artist}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
