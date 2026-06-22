/**
 * songArcReduction.test.ts — shape invariants + determinism guard
 *
 * Run: npx tsx src/scoring/songArcReduction.test.ts
 *
 * Uses synthetic timelines so no DB or audio files are required.
 * Each test locks a specific shape property; magnitudes are tested as
 * invariants (which phase is highest), not exact values.
 */

import { computeSongArc } from "./songArcReduction";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

/** Build a 512×5 timeline where each dimension has a constant value. */
function flatTimeline(val: number): number[][] {
  return Array.from({ length: 512 }, () => [val, val, val, val, val]);
}

/**
 * Build a crescendo timeline: intensity ramps from `lo` at frame 0 to `hi`
 * at frame 511, linearly. Useful for testing that the release phase = peak.
 */
function crescendoTimeline(lo: number, hi: number): number[][] {
  return Array.from({ length: 512 }, (_, i) => {
    const v = lo + (hi - lo) * (i / 511);
    return [v, v, v, v, v];
  });
}

/** Inverse crescendo — peaks at opening, decays to release. */
function decrescendoTimeline(hi: number, lo: number): number[][] {
  return Array.from({ length: 512 }, (_, i) => {
    const v = hi + (lo - hi) * (i / 511);
    return [v, v, v, v, v];
  });
}

/**
 * Spike timeline: frames in a specific quarter are hot, rest are cool.
 * quarter: 0=opening, 1=heldBreath, 2=turn, 3=release
 */
function spikeTimeline(quarter: 0 | 1 | 2 | 3, hotVal: number, coolVal: number): number[][] {
  return Array.from({ length: 512 }, (_, i) => {
    const q = Math.min(3, Math.floor(i / 128));
    const v = q === quarter ? hotVal : coolVal;
    return [v, v, v, v, v];
  });
}

// ── Fixture 1: Flat timeline → all phases equal ───────────────────────────────
{
  console.log("\n── Fixture 1: flat timeline ──");
  const arc = computeSongArc(flatTimeline(0.6), "track-flat");

  assert("opening = heldBreath", arc.opening === arc.heldBreath, `${arc.opening} vs ${arc.heldBreath}`);
  assert("heldBreath = turn",    arc.heldBreath === arc.turn,    `${arc.heldBreath} vs ${arc.turn}`);
  assert("turn = release",       arc.turn === arc.release,       `${arc.turn} vs ${arc.release}`);
  assert("curve length = 4",     arc.curve.length === 4);
  assert("valenceCurve length = 4", arc.valenceCurve.length === 4);
  assert("all magnitudes in [0,100]", [arc.opening, arc.heldBreath, arc.turn, arc.release].every(v => v >= 0 && v <= 100));
}

// ── Fixture 2: Crescendo → release is the peak ────────────────────────────────
{
  console.log("\n── Fixture 2: crescendo (ramp up) ──");
  const arc = computeSongArc(crescendoTimeline(0.0, 1.0), "track-crescendo");

  assert("release = peak phase", arc.release === Math.max(arc.opening, arc.heldBreath, arc.turn, arc.release),
    `${arc.opening}/${arc.heldBreath}/${arc.turn}/${arc.release}`);
  assert("opening = min phase",  arc.opening === Math.min(arc.opening, arc.heldBreath, arc.turn, arc.release));
  assert("release valence bright (> 0)", arc.valenceCurve[3] > 0);
  assert("opening valence dark (< 0)",   arc.valenceCurve[0] < 0);
}

// ── Fixture 3: Decrescendo → opening is the peak ─────────────────────────────
{
  console.log("\n── Fixture 3: decrescendo (ramp down) ──");
  const arc = computeSongArc(decrescendoTimeline(1.0, 0.0), "track-decrescendo");

  assert("opening = peak phase", arc.opening === Math.max(arc.opening, arc.heldBreath, arc.turn, arc.release),
    `${arc.opening}/${arc.heldBreath}/${arc.turn}/${arc.release}`);
  assert("release = min phase",  arc.release === Math.min(arc.opening, arc.heldBreath, arc.turn, arc.release));
}

// ── Fixture 4: Spike in each quarter → correct phase peaks ────────────────────
{
  console.log("\n── Fixture 4: per-quarter spike ──");
  for (const [q, phaseName] of [[0,"opening"],[1,"heldBreath"],[2,"turn"],[3,"release"]] as const) {
    const arc = computeSongArc(spikeTimeline(q, 1.0, 0.1), `track-spike-q${q}`);
    const phaseVals = [arc.opening, arc.heldBreath, arc.turn, arc.release];
    const peak = Math.max(...phaseVals);
    assert(`spike in q${q} → ${phaseName} is peak`, phaseVals[q] === peak,
      `vals=${JSON.stringify(phaseVals)}`);
  }
}

// ── Fixture 5: Determinism guard — 100× same input → same arcHash ─────────────
{
  console.log("\n── Fixture 5: determinism guard (100 runs) ──");
  const timeline = crescendoTimeline(0.2, 0.8);
  const ref = computeSongArc(timeline, "track-det");

  let allMatch = true;
  for (let i = 0; i < 100; i++) {
    const arc = computeSongArc(timeline, "track-det");
    if (arc.arcHash !== ref.arcHash || arc.opening !== ref.opening || arc.release !== ref.release) {
      allMatch = false;
      console.error(`  run ${i + 1} diverged`);
      break;
    }
  }
  assert("100 runs → identical arcHash and phase values", allMatch);
}

// ── Fixture 6: Empty / null-length timeline → safe neutral arc ────────────────
{
  console.log("\n── Fixture 6: edge — empty timeline ──");
  const arc = computeSongArc([], "track-empty");

  assert("no throw",                       true);
  assert("phases in [0,100]",              [arc.opening, arc.heldBreath, arc.turn, arc.release].every(v => v >= 0 && v <= 100));
  assert("returns valid SongArc shape",    arc.curve.length === 4 && arc.valenceCurve.length === 4);
  assert("lexiconVersion = arc-v1",        arc.lexiconVersion === "arc-v1");
  assert("trackId preserved",             arc.trackId === "track-empty");
}

// ── Fixture 7: ValenceCurve polarity — bright vs dark frames ──────────────────
{
  console.log("\n── Fixture 7: valence polarity ──");

  // All-dark (low brightness): spectral centroid → valence col = 0.1
  const dark: number[][] = Array.from({ length: 512 }, () => [0.1, 0.5, 0.5, 0.5, 0.5]);
  const darkArc = computeSongArc(dark, "track-dark");
  assert("dark track: all valence phases < 0", darkArc.valenceCurve.every(v => v < 0));

  // All-bright (high brightness): valence col = 0.9
  const bright: number[][] = Array.from({ length: 512 }, () => [0.9, 0.5, 0.5, 0.5, 0.5]);
  const brightArc = computeSongArc(bright, "track-bright");
  assert("bright track: all valence phases > 0", brightArc.valenceCurve.every(v => v > 0));
}

// ── Fixture 8: arcHash changes when trackId changes ───────────────────────────
{
  console.log("\n── Fixture 8: arcHash includes trackId ──");
  const tl = flatTimeline(0.5);
  const a1 = computeSongArc(tl, "track-aaa");
  const a2 = computeSongArc(tl, "track-bbb");
  assert("different trackId → different arcHash", a1.arcHash !== a2.arcHash);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
