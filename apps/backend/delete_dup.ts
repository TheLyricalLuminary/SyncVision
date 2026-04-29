import "dotenv/config";
import prisma from "./src/lib/prisma";

(async () => {
  const trackId = 'cmojnw2lh0004rh9k76h99kdg';
  
  const cs = await prisma.confidenceScore.deleteMany({
    where: { trackId }
  });
  console.log(`Deleted ${cs.count} ConfidenceScore row(s) for track ${trackId}`);
  
  const track = await prisma.track.delete({
    where: { id: trackId }
  });
  console.log(`Deleted track: ${track.title} (${track.isrc})`);
  
  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
