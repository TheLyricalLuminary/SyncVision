import "dotenv/config";
import prisma from "./src/lib/prisma";

(async () => {
  const analyzed = await prisma.track.count({ where: { trackStatus: "analyzed" } });
  const scores = await prisma.confidenceScore.count();
  console.log("Analyzed tracks:", analyzed);
  console.log("ConfidenceScore rows:", scores);
  console.log("Check 4:", analyzed === scores ? "PASS" : `FAIL — analyzed=${analyzed} scores=${scores}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
