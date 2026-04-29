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
  const row = await prisma.track.findUnique({ where: { id }, include: { rightsProfile: true } });
  const stored = await prisma.confidenceScore.findUnique({ where: { trackId: id } });
  if (!row || !row.rightsProfile || !stored) { console.log("MISSING DATA"); process.exit(1); }

  const { rightsProfile: rp, confidenceScore: _cs, ...trackScalars } = row as typeof row & { confidenceScore: unknown };

  console.log("target hash =", stored.inputHash);
  console.log("current hash =", h({ track: trackScalars, rightsProfile: rp }));
  console.log("");
  console.log("current trackScalars fields:");
  for (const [k, v] of Object.entries(trackScalars)) {
    const preview = k === "timeline" ? `[${(v as number[][]).length} rows]` : JSON.stringify(v);
    console.log(`  ${k}: ${preview}`);
  }
  console.log("\ncurrent rightsProfile fields:");
  for (const [k, v] of Object.entries(rp)) {
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }

  // Try nulling each track field one at a time to find which one changed
  console.log("\n--- Null out each track field one at a time ---");
  for (const key of Object.keys(trackScalars)) {
    const candidate = { ...trackScalars, [key]: null };
    const hash = h({ track: candidate, rightsProfile: rp });
    if (hash === stored.inputHash) console.log(`MATCH: track.${key} was null`);
  }

  // Try each trackStatus value
  console.log("\n--- Try different trackStatus values ---");
  for (const status of ["uploaded", "queued", "analyzing", "analyzed", "failed"]) {
    const candidate = { ...trackScalars, trackStatus: status };
    const hash = h({ track: candidate, rightsProfile: rp });
    if (hash === stored.inputHash) console.log(`MATCH: trackStatus was "${status}"`);
  }

  // Try nulling each rightsProfile field one at a time
  console.log("\n--- Null out each rightsProfile field one at a time ---");
  for (const key of Object.keys(rp)) {
    const candidate = { ...rp, [key]: null };
    const hash = h({ track: trackScalars, rightsProfile: candidate });
    if (hash === stored.inputHash) console.log(`MATCH: rightsProfile.${key} was null`);
  }

  // Try combinations: null timeline + each trackStatus
  console.log("\n--- timeline=null + each trackStatus ---");
  for (const status of ["uploaded", "queued", "analyzing", "analyzed", "failed"]) {
    const candidate = { ...trackScalars, timeline: null, trackStatus: status };
    const hash = h({ track: candidate, rightsProfile: rp });
    if (hash === stored.inputHash) console.log(`MATCH: timeline=null, trackStatus="${status}"`);
  }

  // Try combinations: null timeline + null tempo/tonal/energy + each trackStatus
  console.log("\n--- timeline=null, tempo=null, tonal=null, energy=null + each trackStatus ---");
  for (const status of ["uploaded", "queued", "analyzing", "analyzed", "failed"]) {
    const candidate = { ...trackScalars, timeline: null, tempo: null, tonalCharacter: null, energyCharacter: null, trackStatus: status };
    const hash = h({ track: candidate, rightsProfile: rp });
    if (hash === stored.inputHash) console.log(`MATCH: timeline=null, tempo=null, tonal=null, energy=null, trackStatus="${status}"`);
  }

  // Try: artistName was null
  console.log("\n--- artistName variations ---");
  for (const artist of [null, "", "Mark Amigoni", "Mark William Amigoni"]) {
    const candidate = { ...trackScalars, artistName: artist };
    const hash = h({ track: candidate, rightsProfile: rp });
    if (hash === stored.inputHash) console.log(`MATCH: artistName="${artist}"`);
  }

  // Try: proAffiliation was null on rightsProfile
  console.log("\n--- proAffiliation variations ---");
  for (const pro of [null, "", "ASCAP", "BMI"]) {
    const candidate = { ...rp, proAffiliation: pro };
    const hash = h({ track: trackScalars, rightsProfile: candidate });
    if (hash === stored.inputHash) console.log(`MATCH: proAffiliation="${pro}"`);
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(99); });
