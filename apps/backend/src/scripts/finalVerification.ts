// Final verification of the SyncVision pipeline.
// Obtains a guest SUPERVISOR token via auto-login before making any
// authenticated API calls. Checks data integrity, scene divergence,
// score differentiation, narrative variation, and determinism.

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

async function getJson<T>(path: string, token: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function main() {
  console.log("\n=== SyncVision final verification ===\n");

  // ── Obtain guest token (SUPERVISOR) via auto-login ─────────────────────
  const loginResp = await fetch(`${BASE}/api/auth/auto-login`, { method: "POST" });
  if (!loginResp.ok) throw new Error(`auto-login failed: HTTP ${loginResp.status}`);
  const { token } = await loginResp.json() as { token: string };
  check("auto-login returns SUPERVISOR token", !!token);

  // ── (1) /api/scores: tracks present, no null DSP fields ───────────────
  const all = await getJson<{ rankedTracks: RankedTrack[] }>("/api/scores", token);
  const trackCount = all.rankedTracks.length;
  check(`/api/scores returns tracks`, trackCount > 0, `got ${trackCount}`);

  let dspFailures = 0;
  for (const t of all.rankedTracks) {
    const hasDsp = t.tempo != null && !!t.tonalCharacter && !!t.energyCharacter;
    if (!hasDsp) {
      dspFailures++;
      check(`  ${t.title} has tempo+tonal+energy`, false, "DSP fields null — worker not completed");
    }
  }
  if (dspFailures === 0) {
    check("all tracks have DSP fields populated", true, `${trackCount} tracks`);
  }

  // ── (6) audioFilePath sanity via Prisma directly ───────────────────────
  const { default: prisma } = await import("../lib/prisma");
  const dbTracks = await prisma.track.findMany({ select: { title: true, audioFilePath: true } });
  for (const t of dbTracks) {
    const bad =
      !t.audioFilePath ||
      t.audioFilePath.includes("/tmp/placeholder.wav") ||
      t.audioFilePath.includes("/Downloads/");
    check(`  ${t.title} stable audioFilePath`, !bad, t.audioFilePath ?? "null");
  }

  if (trackCount < 2) {
    console.log("\n  Skipping scene/narrative/determinism checks — need at least 2 tracks.\n");
    await prisma.$disconnect();
    console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  }

  // ── (2) Chase vs Romance scene fit divergence ──────────────────────────
  const chase = await getJson<SceneResp>("/api/scores/scene/chase-tension", token);
  const romance = await getJson<SceneResp>("/api/scores/scene/romance-intimacy", token);

  const chaseByTitle = new Map(chase.rankedMatches.map((m) => [m.title, m]));
  const romanceByTitle = new Map(romance.rankedMatches.map((m) => [m.title, m]));

  console.log("\n  Per-track Scene Fit (chase / romance):");
  let maxSpread = 0;
  for (const t of all.rankedTracks) {
    const c = chaseByTitle.get(t.title);
    const r = romanceByTitle.get(t.title);
    if (!c || !r) continue;
    const spread = Math.abs(c.sceneFit - r.sceneFit);
    maxSpread = Math.max(maxSpread, spread);
    console.log(
      `    ${t.title.padEnd(22)} chase=${String(c.sceneFit).padStart(3)}  romance=${String(r.sceneFit).padStart(3)}  Δ=${spread}`
    );
  }
  check("≥1 track shows ≥25pt Scene Fit spread (chase vs romance)", maxSpread >= 25, `max Δ=${maxSpread}`);

  // ── (3) SyncVision Score differs between briefs ────────────────────────
  const sample = all.rankedTracks[0];
  const cM = chaseByTitle.get(sample.title);
  const rM = romanceByTitle.get(sample.title);
  if (cM && rM) {
    check(
      `matchScore differs for "${sample.title}" between chase and romance`,
      cM.matchScore !== rM.matchScore,
      `chase=${cM.matchScore} romance=${rM.matchScore}`
    );
  }

  // ── (4) Narrative varies across briefs for same track ─────────────────
  console.log("\n  Narrative samples for one track across 4 briefs:");
  const briefSamples = ["chase-tension", "romance-intimacy", "grief-loss", "triumph-victory"];
  const narrativesSeen = new Set<string>();
  for (const bid of briefSamples) {
    const resp = await getJson<SceneResp>(`/api/scores/scene/${bid}`, token);
    const m = resp.rankedMatches.find((x) => x.title === sample.title);
    if (m) {
      narrativesSeen.add(m.sonicNarrative);
      console.log(`    ${bid.padEnd(22)} sceneFit=${String(m.sceneFit).padStart(3)}  ${m.sonicNarrative.slice(0, 80)}`);
    }
  }
  check(
    `narrative varies for "${sample.title}" across 4 briefs`,
    narrativesSeen.size >= 2,
    `${narrativesSeen.size} unique narrative(s)`
  );

  // ── (5) Determinism: identical JSON on repeated calls ─────────────────
  const run1 = await getJson<SceneResp>("/api/scores/scene/chase-tension", token);
  const run2 = await getJson<SceneResp>("/api/scores/scene/chase-tension", token);
  check("same brief twice yields byte-identical JSON", JSON.stringify(run1) === JSON.stringify(run2));

  await prisma.$disconnect();

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
