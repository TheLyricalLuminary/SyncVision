/**
 * resetCatalog.ts — delete all Track records and their dependent rows.
 *
 * Deletes in dependency order:
 *   1. ConfidenceScore  (references Track)
 *   2. RightsProfile    (references Track)
 *   3. Track
 *
 * Usage:
 *   cd apps/backend
 *   npx tsx src/scripts/resetCatalog.ts
 *
 * Requires DATABASE_URL in the environment (sourced from .env automatically
 * by tsx via dotenv, or export DATABASE_URL=... before running).
 *
 * Add --catalog <catalogId> to restrict deletion to one catalog.
 */

import "dotenv/config";
import prisma from "../lib/prisma";

async function main() {
  const catalogArg = process.argv.indexOf("--catalog");
  const catalogId = catalogArg !== -1 ? process.argv[catalogArg + 1] : null;

  const where = catalogId ? { catalogId } : {};
  const scopeLabel = catalogId ? `catalog ${catalogId}` : "all catalogs";

  // Count before
  const trackCount = await prisma.track.count({ where });
  if (trackCount === 0) {
    console.log(`No tracks found in ${scopeLabel}. Nothing to delete.`);
    return;
  }

  console.log(`\nAbout to delete ${trackCount} track(s) from ${scopeLabel}.`);
  console.log("This will also remove all associated ConfidenceScore and RightsProfile rows.");
  console.log("Sleeping 3 seconds — Ctrl-C to abort.\n");
  await new Promise((r) => setTimeout(r, 3000));

  // Resolve track IDs for the scoped delete
  const trackIds = (await prisma.track.findMany({ where, select: { id: true } })).map((t) => t.id);

  const { count: deletedScores } = await prisma.confidenceScore.deleteMany({
    where: { trackId: { in: trackIds } },
  });
  console.log(`Deleted ${deletedScores} ConfidenceScore row(s).`);

  const { count: deletedRights } = await prisma.rightsProfile.deleteMany({
    where: { trackId: { in: trackIds } },
  });
  console.log(`Deleted ${deletedRights} RightsProfile row(s).`);

  const { count: deletedTracks } = await prisma.track.deleteMany({ where });
  console.log(`Deleted ${deletedTracks} Track row(s).`);

  console.log("\nDone. Database is clean — ready for fresh uploads.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
