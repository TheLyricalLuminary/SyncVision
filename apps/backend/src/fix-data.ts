import prisma from "./lib/prisma";

async function main() {
  // Set proAffiliation = "ASCAP" for all tracks that are missing it
  const updated = await prisma.rightsProfile.updateMany({
    where: { proAffiliation: null },
    data: { proAffiliation: "ASCAP" },
  });
  console.log(`Updated proAffiliation for ${updated.count} rights profiles.`);

  // Delete stale ConfidenceScore records so they recalculate from current data
  const deleted = await prisma.confidenceScore.deleteMany({});
  console.log(`Deleted ${deleted.count} stale ConfidenceScore records.`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
