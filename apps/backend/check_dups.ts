import "dotenv/config";
import prisma from "./src/lib/prisma";

(async () => {
  const tracks = await prisma.track.findMany({
    select: { id: true, title: true, isrc: true, trackStatus: true }
  });
  
  // Group by ISRC
  const byIsrc: Record<string, typeof tracks> = {};
  for (const t of tracks) {
    if (!t.isrc) continue;
    if (!byIsrc[t.isrc]) byIsrc[t.isrc] = [];
    byIsrc[t.isrc].push(t);
  }
  
  const dups = Object.entries(byIsrc).filter(([, ts]) => ts.length > 1);
  if (dups.length === 0) {
    console.log("No duplicate ISRCs found.");
  } else {
    for (const [isrc, ts] of dups) {
      console.log(`ISRC ${isrc} has ${ts.length} tracks:`);
      for (const t of ts) console.log(`  ${t.id}  "${t.title}"  status=${t.trackStatus}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
