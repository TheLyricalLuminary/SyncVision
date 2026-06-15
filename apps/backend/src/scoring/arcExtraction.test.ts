/**
 * arcExtraction.test.ts — golden-fixture + determinism tests
 *
 * Run: npx tsx src/scoring/arcExtraction.test.ts
 *
 * Determinism contract: same (sceneText, sceneParams, lexiconVersion) → byte-identical
 * output every time. inputHash is the audit handle.
 */

import { extractSceneArc } from "./arcExtraction";

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

function near(actual: number, expected: number, tolerance: number, label: string) {
  assert(label, Math.abs(actual - expected) <= tolerance, `got ${actual}, expected ${expected} ±${tolerance}`);
}

// ── Fixture 1: Golden scene (estranged brothers / funeral / forgiveness) ──────
{
  console.log("\n── Fixture 1: golden scene (brothers/funeral/forgiveness) ──");

  const scene = "Two estranged brothers reconnect at a funeral. The conversation is restrained. One finally admits regret. The scene ends with quiet forgiveness.";
  const arc = extractSceneArc(scene);

  near(arc.opening,     52, 6, "opening ≈ 52");
  near(arc.heldBreath,  44, 6, "heldBreath ≈ 44");
  near(arc.turn,        78, 8, "turn ≈ 78");
  near(arc.release,     88, 8, "release ≈ 88");

  // Shape invariants — these must hold regardless of calibration drift
  assert("heldBreath < opening (dip)", arc.heldBreath < arc.opening);
  assert("turn > opening (rise)", arc.turn > arc.opening);
  assert("release === max phase", arc.release === Math.max(arc.opening, arc.heldBreath, arc.turn, arc.release));

  // Signals
  const sigs = arc.signals;
  assert("signal: grief",          sigs.includes("grief"));
  assert("signal: reconciliation", sigs.includes("reconciliation"));
  assert("signal: confession",     sigs.includes("confession"));
  assert("signal: forgiveness",    sigs.includes("forgiveness"));

  // Narrative certainty
  near(arc.narrativeCertainty, 0.84, 0.10, "narrativeCertainty ≈ 0.84");
  assert("narrativeCertainty in [0,1]", arc.narrativeCertainty >= 0 && arc.narrativeCertainty <= 1);

  // Provenance fields
  assert("inputHash non-empty",    typeof arc.inputHash === "string" && arc.inputHash.length > 8);
  assert("lexiconVersion = arc-v1", arc.lexiconVersion === "arc-v1");
  assert("category set",           arc.category != null);

  // Events have provenance
  const evWithMatch = arc.events.filter(e => e.matched && e.sentence > 0);
  assert("events have matched + sentence", evWithMatch.length >= 3);

  // Curve arrays
  assert("curve length = 4",        arc.curve.length === 4);
  assert("valenceCurve length = 4", arc.valenceCurve.length === 4);

  // Polarity: forgiveness scene should be net positive in release phase
  assert("release valenceCurve > 0 (bright)", arc.valenceCurve[3] > 0);
}

// ── Fixture 2: Determinism guard — 100 × same text → identical hash ──────────
{
  console.log("\n── Fixture 2: determinism guard (100 runs) ──");

  const scene = "Two estranged brothers reconnect at a funeral. The conversation is restrained. One finally admits regret. The scene ends with quiet forgiveness.";
  const ref = extractSceneArc(scene);

  let allMatch = true;
  for (let i = 0; i < 100; i++) {
    const arc = extractSceneArc(scene);
    if (arc.inputHash !== ref.inputHash || arc.opening !== ref.opening || arc.turn !== ref.turn) {
      allMatch = false;
      console.error(`  run ${i + 1} diverged: hash=${arc.inputHash} opening=${arc.opening} turn=${arc.turn}`);
      break;
    }
  }
  assert("100 runs → identical inputHash and phase values", allMatch);
}

// ── Fixture 3: Empty / near-empty input ───────────────────────────────────────
{
  console.log("\n── Fixture 3: edge — empty input ──");

  const arc = extractSceneArc("");
  assert("empty: no throw",          true); // reaching here = didn't throw
  assert("empty: signals = []",      arc.signals.length === 0);
  assert("empty: certainty = 0",     arc.narrativeCertainty === 0);
  assert("empty: phases in [0,100]", [arc.opening, arc.heldBreath, arc.turn, arc.release].every(v => v >= 0 && v <= 100));
}

// ── Fixture 4: Revenge scene — dark valence ───────────────────────────────────
{
  console.log("\n── Fixture 4: revenge / dark valence ──");

  const scene = "She discovers the betrayal. Cold fury builds through the confrontation. She takes her revenge at the climax. The scene ends in desolation.";
  const arc = extractSceneArc(scene);

  assert("signals include betrayal or revenge", arc.signals.includes("betrayal") || arc.signals.includes("revenge"));
  // Dark scene: release valenceCurve should be negative or at most neutral
  assert("dark scene: release valence ≤ 0", arc.valenceCurve[3] <= 0);
  // Shape: confrontation/betrayal should spike toward turn/release
  assert("turn or release ≥ opening", arc.turn >= arc.opening || arc.release >= arc.opening);
}

// ── Fixture 5: Events-only, no recognisable category ─────────────────────────
{
  console.log("\n── Fixture 5: events but unusual text ──");

  const scene = "Grief overwhelms her. Confession pours out. Forgiveness follows slowly.";
  const arc = extractSceneArc(scene);

  assert("events fire even without category context", arc.signals.length >= 2);
  assert("release > 0", arc.release > 0);
}

// ── Fixture 6: sceneParams pacing modulator is deterministic ─────────────────
{
  console.log("\n── Fixture 6: sceneParams determinism ──");

  const scene = "A soldier says goodbye. The scene ends with silence.";
  const slow = extractSceneArc(scene, { pacing: "slow", emotionalRegister: null, sceneLengthSec: null });
  const slow2 = extractSceneArc(scene, { pacing: "slow", emotionalRegister: null, sceneLengthSec: null });

  assert("same params → same hash", slow.inputHash === slow2.inputHash);
  assert("same params → same opening", slow.opening === slow2.opening);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
