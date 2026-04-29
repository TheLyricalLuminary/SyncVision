import "dotenv/config";
import prisma from "./src/lib/prisma";

(async () => {
  const ids = ['cmojnpqm60002rh9kx6oianjs', 'cmojs1hq50009rh9kboq9azvx'];
  
  for (const trackId of ids) {
    const rp = await prisma.rightsProfile.deleteMany({ where: { trackId } });
    const cs = await prisma.confidenceScore.deleteMany({ where: { trackId } });
    const t = await prisma.track.delete({ where: { id: trackId } });
    console.log(`Deleted "${t.title}" (${t.isrc}) — ${rp.count} RightsProfile, ${cs.count} ConfidenceScore`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
