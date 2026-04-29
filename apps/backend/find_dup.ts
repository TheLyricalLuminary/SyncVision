import "dotenv/config";
import prisma from "./src/lib/prisma";

(async () => {
  const track = await prisma.track.findFirst({
    where: { 
      title: 'Mark_Amigoni_Breaking_Chains',
      isrc: 'QZTB72565415'
    }
  });
  if (track) {
    console.log('Found track:', { id: track.id, title: track.title, isrc: track.isrc });
  } else {
    console.log('Track not found');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
