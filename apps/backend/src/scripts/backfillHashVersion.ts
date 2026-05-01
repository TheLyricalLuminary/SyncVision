import "dotenv/config";
import prisma from "../lib/prisma";

async function main() {
  const result = await prisma.confidenceScore.updateMany({
    data: { hashVersion: 1 },
  });
  console.log(`Backfilled hashVersion=1 on ${result.count} ConfidenceScore rows.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
