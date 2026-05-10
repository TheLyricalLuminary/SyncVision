import "dotenv/config";
import prisma from "../lib/prisma";

const DUPLICATE_ISRC = "QZTB72565415";

async function main() {
  const tracks = await prisma.track.findMany({
    where: { isrc: DUPLICATE_ISRC },
    orderBy: { id: "asc" },
    include: { confidenceScore: true, rightsProfile: true },
  });

  if (tracks.length === 0) {
    console.log(`No tracks found with ISRC ${DUPLICATE_ISRC}.`);
    return;
  }

  if (tracks.length === 1) {
    console.log(`Only one track with ISRC ${DUPLICATE_ISRC} — nothing to delete.`);
    return;
  }

  console.log(`Found ${tracks.length} tracks with ISRC ${DUPLICATE_ISRC}:`);
  for (const t of tracks) {
    console.log(`  id=${t.id}  title="${t.title}"  status=${t.trackStatus}`);
  }

  // Keep the first (lowest id / earliest created), delete the rest
  const [, ...duplicates] = tracks;

  for (const dup of duplicates) {
    console.log(`\nDeleting duplicate id=${dup.id}...`);

    if (dup.confidenceScore) {
      await prisma.confidenceScore.delete({ where: { id: dup.confidenceScore.id } });
      console.log(`  Deleted ConfidenceScore id=${dup.confidenceScore.id}`);
    }
    if (dup.rightsProfile) {
      await prisma.rightsProfile.delete({ where: { id: dup.rightsProfile.id } });
      console.log(`  Deleted RightsProfile id=${dup.rightsProfile.id}`);
    }
    await prisma.track.delete({ where: { id: dup.id } });
    console.log(`  Deleted Track id=${dup.id}`);
  }

  console.log("\nDeduplication complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
