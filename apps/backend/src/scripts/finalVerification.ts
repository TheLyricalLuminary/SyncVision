// Final verification of the SyncVision pipeline:
// 1. /api/scores returns 8 tracks with no null DSP fields
// 2. Chase/Tension vs Romance/Intimacy give meaningfully different Scene Fit
// 3. SyncVision Score changes between briefs (driven by Scene Fit)
// 4. Narrative differs between two different briefs (same track)
// 5. Same track + same brief yields identical scores + identical narrative
// 6. No track has audioFilePath in /tmp/placeholder.wav or under ~/Downloads

import "dotenv/config";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";

interface RankedTrack {
  trackId: string;
  title: string;
  tempo: number | null;
  tonalCharacter: string | null;
  energyCharacter: string | null;
}

interface SceneMatch {
  trackId: string;
  title: string;
  matchScore: number;
  sceneFit: number;
  rightsClarity: number;
  metadataCompleteness: number;
  sonicNarrative: string;
  inputHash: string;
}

interface SceneResp {
  sceneId: string;
  sceneLabel: string;
  rankedMatches: SceneMatch[];
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures++;
  console.log(`  [${tag}] ${label}${detail ? "  — " + detail : ""}`);
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function main() {
  console.log("\n=== SyncVision final verification ===\n");

  // ── (1) /api/scores: 8 tracks, no null DSP fields ─────────────────────────
  const all = await getJson<{ rankedTracks: RankedTrack[] }>("/api/scores");
  check("/api/scores returns 8 tracks", all.rankedTracks.length === 8, `got ${all.rankedTracks.length}`);
  for (const t of all.rankedTracks) {
    const hasDsp =
      t.tempo != null && !!t.tonalCharacter && !!t.energyCharacter;
    check(`  ${t.title} has tempo+tonal+energy`, hasDsp);
  }

  // ── (6) audioFilePath sanity (DB query via the same API surface) ─────────
  // Query Prisma directly for paths
  const { default: prisma } = await import("../lib/prisma");
  const dbTracks = await prisma.track.findMany({ select: { title: true, audioFilePath: true } });
  for (const t of dbTracks) {
    const bad =
      !t.audioFilePath ||
      t.audioFilePath.includes("/tmp/placeholder.wav") ||
      t.audioFilePath.includes("/Downloads/");
    check(`  ${t.title} stable audioFilePath`, !bad, t.audioFilePath ?? "null");
  }

  // ── (2) Chase/Tension vs Romance/Intimacy yield meaningfully different Scene Fit ──
  const chase = await getJson<SceneResp>("/api/scores/scene/chase-tension");
  const romance = await getJson<SceneResp>("/api/scores/scene/romance-intimacy");

  const chaseByTitle = new Map(chase.rankedMatches.map((m) => [m.title, m]));
  const romanceByTitle = new Map(romance.rankedMatches.map((m) => [m.title, m]));

  console.log("\n  Per-track Scene Fit comparison (chase / romance):");
  let maxSpread = 0;
  for (const t of all.rankedTracks) {
    const c = chaseByTitle.get(t.title)!;
    const r = romanceByTitle.get(t.title)!;
    const spread = Math.abs(c.sceneFit - r.sceneFit);
    maxSpread = Math.max(maxSpread, spread);
    console.log(`    ${t.title.padEnd(22)} chase=${c.sceneFit.toString().padStart(3)}  romance=${r.sceneFit.toString().padStart(3)}  Δ=${spread}`);
  }
  check("at least one track shows >= 25 point Scene Fit spread between chase and romance", maxSpread >= 25, `max Δ = ${maxSpread}`);

  // ── (3) SyncVision Score changes between briefs (driven by Scene Fit) ─────
  const sample = all.rankedTracks[0];
  const cM = chaseByTitle.get(sample.title)!;
  const rM = romanceByTitle.get(sample.title)!;
  check(
    `SyncVision Score for ${sample.title} differs between chase and romance`,
    cM.matchScore !== rM.matchScore,
    `chase=${cM.matchScore} romance=${rM.matchScore}`
  );

  // ── (4) Narrative differs between two different briefs for same track ─────
  // Pick a track and compare its narrative across 4 briefs
  console.log("\n  Narrative samples for one track across 4 briefs:");
  const sampleTitle = sample.title;
  const briefSamples = ["chase-tension", "romance-intimacy", "grief-loss", "triumph-victory"];
  const narrativesSeen = new Set<string>();
  for (const bid of briefSamples) {
    const r = await getJson<SceneResp>(`/api/scores/scene/${bid}`);
    const m = r.rankedMatches.find((x) => x.title === sampleTitle)!;
    narrativesSeen.add(m.sonicNarrative);
    console.log(`    ${bid.padEnd(22)} sceneFit=${m.sceneFit.toString().padStart(3)}  ${m.sonicNarrative}`);
  }
  check(
    `narrative differs for ${sampleTitle} across 4 briefs`,
    narrativesSeen.size >= 2,
    `${narrativesSeen.size} unique narrative(s)`
  );

  // ── (5) Determinism: same track + same brief → identical scores AND narrative ──
  const run1 = await getJson<SceneResp>("/api/scores/scene/chase-tension");
  const run2 = await getJson<SceneResp>("/api/scores/scene/chase-tension");
  const sameJson = JSON.stringify(run1) === JSON.stringify(run2);
  check("same brief twice yields byte-identical response", sameJson);

  await prisma.$disconnect();

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
