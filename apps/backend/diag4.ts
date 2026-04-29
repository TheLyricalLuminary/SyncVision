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

(async () => {
  const id = "cmojfhtnt00004y9knebb3u3x";
  // Mirror exactly how scores.ts fetches and passes data
  const tracks = await prisma.track.findMany({
    where: { id },
    include: { rightsProfile: true, confidenceScore: true },
  });
  const track = tracks[0];
  if (!track) { console.log("NOT FOUND"); process.exit(1); }

  const stored = track.confidenceScore;
  const { rightsProfile: rp, confidenceScore: _cs, ...trackScalars } = track;
  const profile = rp ?? {};

  const json = sortedJson({ track: trackScalars, rightsProfile: profile });
  const currentHash = createHash("sha256").update(json).digest("hex");

  console.log("stored hash  =", stored?.inputHash);
  console.log("current hash =", currentHash);
  console.log("match        =", stored?.inputHash === currentHash);
  console.log("");
  // Print the JSON with timeline truncated to first 3 rows for inspection
  const parsed = JSON.parse(json) as { track: { timeline?: number[][] } };
  const timelineLen = Array.isArray(parsed.track?.timeline) ? parsed.track.timeline.length : 0;
  if (parsed.track?.timeline) parsed.track.timeline = parsed.track.timeline.slice(0, 3);
  console.log(`Full JSON input (timeline truncated from ${timelineLen} rows to 3):`);
  console.log(JSON.stringify(parsed, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
