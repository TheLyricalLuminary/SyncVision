/**
 * One-time backfill: set master ownership fields on all existing RightsProfile rows
 * that have no masterOwnershipType yet.
 *
 * Run: npx ts-node -e "require('./src/scripts/backfillMasterOwnership')"
 *   or: npx tsx src/scripts/backfillMasterOwnership.ts
 */

import prisma from "../lib/prisma";

async function main() {
  const profiles = await prisma.rightsProfile.findMany({
    where: { masterOwnershipType: null },
    select: { id: true, trackId: true },
  });

  if (profiles.length === 0) {
    console.log("No profiles need backfill — all already have masterOwnershipType.");
    return;
  }

  console.log(`Backfilling ${profiles.length} profile(s)…`);

  const now = new Date();

  for (const p of profiles) {
    await prisma.rightsProfile.update({
      where: { id: p.id },
      data: {
        masterOwnedBy: "Mark William Amigoni",
        masterOwnershipType: "SELF_OWNED",
        masterVerifiedAt: now,
        masterOwnershipSplits: undefined,
      },
    });
    console.log(`  ✓ trackId=${p.trackId}`);
  }

  console.log("Backfill complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
