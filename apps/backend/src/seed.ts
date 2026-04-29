import prisma from "./lib/prisma";

async function seed() {
  await prisma.confidenceScore.deleteMany();
  await prisma.rightsProfile.deleteMany();
  await prisma.track.deleteMany();

  const tracks = [
    {
      title: "Never Letting Go",
      isrc: "QZRP52418558",
      rights: { ascapWorkId: "928218454" },
    },
    {
      title: "Where We Belong",
      isrc: "QZTB72567824",
      rights: { ascapWorkId: "930167043" },
    },
    {
      title: "Breaking Chains",
      isrc: "QZTB72565415",
      rights: { ascapWorkId: "928212151" },
    },
  ];

  for (const t of tracks) {
    const created = await prisma.track.create({
      data: {
        title: t.title,
        isrc: t.isrc,
        rightsProfile: {
          create: {
            ascapWorkId: t.rights.ascapWorkId,
            masterOwnershipPct: 100,
            isOneStop: true,
            writerName: "Mark William Amigoni",
            writerIpi: "1272656440",
            publisherName: "The Lyrical Luminary",
            proAffiliation: "ASCAP",
          },
        },
      },
    });
    console.log(`Created: ${created.title} (${created.id})`);
  }

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
