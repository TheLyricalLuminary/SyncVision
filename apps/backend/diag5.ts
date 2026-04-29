import "dotenv/config";
import prisma from "./src/lib/prisma";

(async () => {
  const id = "cmojfhtnt00004y9knebb3u3x";
  const before = await prisma.confidenceScore.findUnique({ where: { trackId: id } });
  console.log("BEFORE delete:", before ? { inputHash: before.inputHash, score: before.score } : "no row");

  const result = await prisma.confidenceScore.deleteMany({ where: { trackId: id } });
  console.log(`Deleted ${result.count} ConfidenceScore row(s) for track ${id}.`);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
