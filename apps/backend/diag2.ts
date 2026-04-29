import "dotenv/config";
import { createHash } from "crypto";
import prisma from "./src/lib/prisma";

function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>).sort()
        .reduce<Record<string, unknown>>((acc, k) => { acc[k] = (val as Record<string, unknown>)[k]; return acc; }, {});
    }
    return val;
  });
}

function h(obj: unknown) {
  return createHash("sha256").update(sortedJson(obj)).digest("hex");
}

(async () => {
  const id = "cmojfhtnt00004y9knebb3u3x";
  const track = await prisma.track.findUnique({ where: { id }, include: { rightsProfile: true } });
  const stored = await prisma.confidenceScore.findUnique({ where: { trackId: id } });
  if (!track || !track.rightsProfile || !stored) { console.log("MISSING DATA"); process.exit(1); }

  const rp = track.rightsProfile;
  console.log("stored hash =", stored.inputHash);
  console.log("");

  // Vary timeline and analysis fields to find the stored state
  const timelineValues: Array<[string, unknown]> = [["null", null], ["populated", track.timeline]];
  const statuses = ["uploaded", "queued", "analyzing", "analyzed"];
  const tempoValues: Array<[string, unknown]> = [["null", null], ["112.35", track.tempo]];

  for (const [tLabel, timeline] of timelineValues) {
    for (const status of statuses) {
      for (const [tempoLabel, tempo] of tempoValues) {
        const tonal = tempo === null ? null : track.tonalCharacter;
        const energy = tempo === null ? null : track.energyCharacter;
        const candidate = { ...track, timeline, trackStatus: status, tempo, tonalCharacter: tonal, energyCharacter: energy };
        const hash = h({ track: candidate, rightsProfile: rp });
        if (hash === stored.inputHash) {
          console.log(`MATCH: timeline=${tLabel}, status=${status}, tempo=${tempoLabel}, tonal=${tonal}, energy=${energy}`);
        }
      }
    }
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
