import prisma from "./lib/prisma";

async function main() {
  const tracks = await prisma.track.findMany({ include: { rightsProfile: true, confidenceScore: true } });
  for (const t of tracks) {
    console.log('TRACK:', t.title, t.isrc);
    console.log('RIGHTS:', JSON.stringify(t.rightsProfile));
    console.log('SCORE:', JSON.stringify(t.confidenceScore));
    console.log('---');
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
