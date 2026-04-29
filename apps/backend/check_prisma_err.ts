import "dotenv/config";
import prisma from "./src/lib/prisma";

(async () => {
  try {
    await prisma.track.create({
      data: { title: "test", isrc: "QZTB72565415", trackStatus: "uploaded" }
    });
  } catch (e: unknown) {
    console.log("typeof e:", typeof e);
    console.log("code:", (e as Record<string, unknown>).code);
    console.log("name:", (e as Record<string, unknown>).name);
    console.log("message slice:", (e as Error).message?.slice(0, 80));
  }
  process.exit(0);
})().catch(console.error);
