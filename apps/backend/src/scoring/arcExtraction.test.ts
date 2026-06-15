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

// ── Fixture 7: Betrayal — expanded trigger vocabulary ────────────────────────
{
  console.log("\n── Fixture 7: betrayal — expanded triggers ──");

  // "sold out" and "framed" are the new triggers added in lexicon patch
  const scene = "He trusted her completely. She sold out the team for a deal. When he discovers he was framed, the confrontation erupts.";
  const arc = extractSceneArc(scene);

  assert("sold out / framed → betrayal fires", arc.signals.includes("betrayal"));
  assert("betrayal valenceCurve ≤ -20 at turn", arc.valenceCurve[2] <= -20);
  assert("turn elevated (confrontation)", arc.turn >= arc.opening);
}

// ── Fixture 8: Revenge — expanded trigger vocabulary ─────────────────────────
{
  console.log("\n── Fixture 8: revenge — expanded triggers ──");

  const scene = "She spent years waiting. Now she will dismantle everything he built. The confrontation reaches its peak as she moves to expose him.";
  const arc = extractSceneArc(scene);

  assert("dismantle / expose him → revenge fires", arc.signals.includes("revenge"));
  assert("revenge valence dark (≤ -20)", arc.valenceCurve[2] <= -20 || arc.valenceCurve[3] <= -20);
}

// ── Fixture 9: Farewell — expanded trigger vocabulary ────────────────────────
{
  console.log("\n── Fixture 9: farewell — expanded triggers ──");

  const scene = "She storms off without a word. He watches her walk out the door for the last time. The room falls quiet.";
  const arc = extractSceneArc(scene);

  assert("storms off / walks out → farewell fires", arc.signals.includes("farewell"));
}

// ── Fixture 10: Revelation in a dark scene — valence now ≤ 0 ─────────────────
{
  console.log("\n── Fixture 10: revelation — dark valence ──");

  const scene = "The detective reveals the truth. The suspect discovers they were wrong all along. Horror settles in.";
  const arc = extractSceneArc(scene);

  assert("revelation + horror fire", arc.signals.includes("revelation") || arc.signals.includes("horror"));
  // Post-patch: revelation valence is -0.3 (not 0.0), so dark scene stays dark
  assert("turn/release net valence ≤ 0", arc.valenceCurve[2] <= 0 || arc.valenceCurve[3] <= 0);
}

// ── Fixture 11: Realization in a dark context ────────────────────────────────
{
  console.log("\n── Fixture 11: realization — dark valence ──");

  const scene = "It dawns on him that everything was a lie. He understands at last what she sacrificed — and what it cost. Grief overwhelms him.";
  const arc = extractSceneArc(scene);

  assert("realization + grief fire", arc.signals.includes("grief"));
  // Post-patch: realization valence is -0.2, no longer incorrectly bright
  assert("turn/held-breath net valence ≤ 0", arc.valenceCurve[1] <= 0 || arc.valenceCurve[2] <= 0);
}

// ── Fixture 12: Mixed-signal scene (bright + dark coexist) ────────────────────
{
  console.log("\n── Fixture 12: mixed signals (joy + grief) ──");

  const scene = "The funeral brings everyone together. Laughter and tears mix as they remember her. By the end there is acceptance, even joy.";
  const arc = extractSceneArc(scene);

  assert("grief fires", arc.signals.includes("grief"));
  assert("joy or acceptance fires", arc.signals.includes("joy") || arc.signals.includes("acceptance"));
  // Release should be net positive (joy/acceptance outweigh grief in release phase)
  assert("release valence > -50 (not crushing)", arc.valenceCurve[3] > -50);
}

// ── Fixture 13: False-positive guard — "finally" alone must not spike turn ───
{
  console.log("\n── Fixture 13: false-positive guard — 'finally' alone ──");

  const scene = "She finally arrived at the station. The train was late. She waited.";
  const arc = extractSceneArc(scene);

  // "finally" is a PACING marker (sharpens turn ×1.06) but should not spike
  // the arc unless real narrative events are present too
  assert("low signal scene: certainty < 0.5", arc.narrativeCertainty < 0.5);
  assert("low signal scene: turn < 80", arc.turn < 80);
}

// ── Fixture 14: Shape invariant — rescue/escape arc ──────────────────────────
{
  console.log("\n── Fixture 14: rescue arc shape ──");

  const scene = "Tension builds as they search in darkness. The threat closes in. She breaks free just in time. Relief floods the scene.";
  const arc = extractSceneArc(scene);

  assert("escape fires", arc.signals.includes("escape") || arc.signals.includes("threat") || arc.signals.includes("tension"));
  // Escape arcs peak at Turn (the break), not Release — HeldBreath carries the tension build
  assert("turn = highest phase (escape climax)", arc.turn === Math.max(arc.opening, arc.heldBreath, arc.turn, arc.release));
  assert("release > opening (partial resolution)", arc.release > arc.opening);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
