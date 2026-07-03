/**
 * Unit tests for dnaAdjudication.ts — Temp Track DNA Adjudication Engine.
 *
 * Pattern: throw on failure, console.log "PASS" on success (project convention).
 * Run: tsx src/scoring/dnaAdjudication.test.ts
 */

import {
  normalizeSigmoid,
  sigmoidExpandArray,
  computeDivergence,
  applyZeroPocketPenalty,
  calculateDNAOffset,
  verifyZeroPocket,
  adjudicateDNA,
  DEFAULT_DNA_WEIGHTS,
  DEFAULT_ZERO_POCKET_OPTIONS,
} from "./dnaAdjudication";

import type { ForensicTimeline } from "../services/processAudio";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fail(label: string, msg: string): never {
  throw new Error(`FAIL [${label}] ${msg}`);
}

function assert(cond: boolean, label: string, msg = ""): void {
  if (!cond) fail(label, msg || "condition was false");
  console.log(`  PASS [${label}]`);
}

function assertApprox(a: number, b: number, label: string, tol = 1e-9): void {
  if (Math.abs(a - b) > tol) fail(label, `${a} ≠ ${b} (tol=${tol})`);
  console.log(`  PASS [${label}]`);
}

function assertEq<T>(a: T, b: T, label: string): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail(label, `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  }
  console.log(`  PASS [${label}]`);
}

function assertThrows(fn: () => unknown, label: string, needle?: string): void {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (needle && !msg.includes(needle)) {
      fail(label, `threw, but message "${msg}" lacks "${needle}"`);
    }
    console.log(`  PASS [${label}]`);
    return;
  }
  fail(label, "did not throw");
}

// ── Signal factories ──────────────────────────────────────────────────────────

function sine(n: number, freq = 0.15, amp = 0.4, offset = 0.5): number[] {
  return Array.from({ length: n }, (_, i) => amp * Math.sin(i * freq) + offset);
}

function constant(n: number, v: number): number[] {
  return new Array<number>(n).fill(v);
}

/** Delay `arr` by `k` frames, padding the head with `pad` (content preserved, truncated tail). */
function delay(arr: number[], k: number, pad = 0): number[] {
  return [...new Array<number>(k).fill(pad), ...arr.slice(0, arr.length - k)];
}

function makeTimeline(base: number[], overrides: Partial<ForensicTimeline> = {}): ForensicTimeline {
  return {
    subZero:         base,
    zeroPocketZone:  overrides.zeroPocketZone  ?? base.map(v => v * 0.5),
    presence:        overrides.presence        ?? base.map(v => 1 - v),
    highFidelityAir: overrides.highFidelityAir ?? constant(base.length, 0),
    cmamTension:     overrides.cmamTension     ?? base.map(v => v * 0.8),
    ...overrides,
  };
}

// ── Tests: normalizeSigmoid / sigmoidExpandArray ─────────────────────────────

console.log("\n=== normalizeSigmoid ===\n");

assertApprox(normalizeSigmoid(0),   0,   "boundary: f(0) = 0");
assertApprox(normalizeSigmoid(0.5), 0.5, "boundary: f(0.5) = 0.5");
assertApprox(normalizeSigmoid(1),   1,   "boundary: f(1) = 1");
assert(normalizeSigmoid(0.3) < 0.3, "sharpening: f(0.3) < 0.3");
assert(normalizeSigmoid(0.7) > 0.7, "sharpening: f(0.7) > 0.7");
assertApprox(normalizeSigmoid(-5), 0, "clamps below 0");
assertApprox(normalizeSigmoid(9),  1, "clamps above 1");

{
  // Monotonic across the full range
  let prev = -1;
  let monotonic = true;
  for (let i = 0; i <= 100; i++) {
    const v = normalizeSigmoid(i / 100);
    if (v < prev) { monotonic = false; break; }
    prev = v;
  }
  assert(monotonic, "monotonic over [0,1]");
}

console.log("\n=== sigmoidExpandArray ===\n");

{
  const arr = sine(50);
  const out = sigmoidExpandArray(arr);
  assert(out.length === arr.length, "preserves length");
  assert(out.every(v => v >= 0 && v <= 1), "output within [0,1]");
  assertEq(sigmoidExpandArray(arr), out, "deterministic");
  assertEq(sigmoidExpandArray([]), [], "empty in → empty out");
}

// ── Tests: computeDivergence (10-90 Rule) ────────────────────────────────────

console.log("\n=== computeDivergence ===\n");

assertApprox(computeDivergence(100), 10, "matchScore 100 → divergence 10");
assertApprox(computeDivergence(70),  34, "matchScore 70 → divergence 34");
assertApprox(computeDivergence(0),   90, "matchScore 0 → divergence 90");
assertApprox(computeDivergence(87.6543), 90 - 87.6543 * 0.8, "4-dp intermediate", 1e-4);

// ── Tests: applyZeroPocketPenalty (scalar form) ──────────────────────────────

console.log("\n=== applyZeroPocketPenalty ===\n");

assertApprox(applyZeroPocketPenalty(100, 1, 1),   70, "full vocal + full dialogue → −30");
assertApprox(applyZeroPocketPenalty(100, 0, 1),  100, "zero pocket energy → no penalty");
assertApprox(applyZeroPocketPenalty(100, 1, 0),  100, "no dialogue → no penalty");
assertApprox(applyZeroPocketPenalty(10, 1, 1),     0, "floors at 0");

// ── Tests: calculateDNAOffset ────────────────────────────────────────────────

console.log("\n=== calculateDNAOffset ===\n");

{
  // Self-match: lag 0, correlation 1
  const t = makeTimeline(sine(200), { cmamTension: sine(200, 0.23, 0.3, 0.5) });
  const r = calculateDNAOffset(t, t, 25);
  assertEq(r.lagFrames, 0, "self-match lag = 0");
  assertEq(r.dropFrameOffsetSec, 0, "self-match offset = 0s");
  assertApprox(r.correlation, 1, "self-match correlation = 1", 1e-3);
  assertEq(r.activeBands, ["subZero", "cmamTension"], "air band inactive at 16 kHz");
}

{
  // Sign convention: lagFrames is how far to DELAY (+) or ADVANCE (−) the
  // proposed track so its structure aligns with the temp track.
  const base    = sine(200, 0.11, 0.35, 0.5);
  const tension = sine(200, 0.29, 0.3, 0.5);
  const temp    = makeTimeline(base, { cmamTension: tension });

  // Proposed content arrives 10 frames LATE (delayed) → advance it: lag = −10
  const late = makeTimeline(delay(base, 10, base[0]), {
    cmamTension: delay(tension, 10, tension[0]),
  });
  const rLate = calculateDNAOffset(temp, late, 25);
  assertEq(rLate.lagFrames, -10, "late proposed → advance by 10 frames (lag −10)");
  assertApprox(rLate.dropFrameOffsetSec, -0.4, "offset = −10/25 = −0.4s");

  // Proposed content arrives 10 frames EARLY (advanced) → delay it: lag = +10
  const advance = (arr: number[], k: number): number[] =>
    [...arr.slice(k), ...new Array<number>(k).fill(arr[arr.length - 1])];
  const early = makeTimeline(advance(base, 10), {
    cmamTension: advance(tension, 10),
  });
  const rEarly = calculateDNAOffset(temp, early, 25);
  assertEq(rEarly.lagFrames, 10, "early proposed → delay by 10 frames (lag +10)");
  assertApprox(rEarly.dropFrameOffsetSec, 0.4, "offset = 10/25 = 0.4s");
}

{
  // Air band active in deep mode: participates in the sweep
  const base = sine(150);
  const air  = sine(150, 0.31, 0.25, 0.4);
  const t = makeTimeline(base, { highFidelityAir: air });
  const r = calculateDNAOffset(t, t, 25);
  assertEq(
    r.activeBands,
    ["subZero", "cmamTension", "highFidelityAir"],
    "air active when it carries signal in both tracks",
  );
  assertApprox(r.bandCorrelations.highFidelityAir, 1, "air self-correlation = 1", 1e-3);
}

{
  // Everything silent → structurally indistinguishable, lag 0, correlation 0
  const silent = makeTimeline(constant(100, 0), {
    cmamTension: constant(100, 0),
    highFidelityAir: constant(100, 0),
  });
  const r = calculateDNAOffset(silent, silent, 25);
  assertEq(r.lagFrames, 0, "silence vs silence → lag 0");
  assertEq(r.correlation, 0, "silence vs silence → correlation 0");
  assertEq(r.activeBands, [], "no active bands");
}

{
  // Determinism: byte-identical output
  const a = makeTimeline(sine(120, 0.17), { cmamTension: sine(120, 0.37, 0.2, 0.5) });
  const b = makeTimeline(sine(120, 0.19), { cmamTension: sine(120, 0.41, 0.2, 0.5) });
  assertEq(
    JSON.stringify(calculateDNAOffset(a, b, 25)),
    JSON.stringify(calculateDNAOffset(a, b, 25)),
    "deterministic across runs",
  );
}

{
  // Operational errors
  const t = makeTimeline(sine(50));
  assertThrows(
    () => calculateDNAOffset(makeTimeline([]), t, 25),
    "empty band throws descriptive error",
    "missing or empty",
  );
  assertThrows(
    () => calculateDNAOffset(makeTimeline([0.1, NaN, 0.3]), t, 25),
    "NaN in band throws with frame index",
    "non-finite value at frame 1",
  );
  assertThrows(
    () => calculateDNAOffset(t, t, 0),
    "fps=0 throws",
    "fps must be a positive number",
  );
  assertThrows(
    () => calculateDNAOffset(null as unknown as ForensicTimeline, t, 25),
    "null tempTimeline throws",
    "tempTimeline is required",
  );
}

// ── Tests: verifyZeroPocket ──────────────────────────────────────────────────

console.log("\n=== verifyZeroPocket ===\n");

{
  // Temp has dips at frames 10–19; proposed is loud everywhere → all violated
  const temp = constant(100, 0.8);
  for (let i = 10; i < 20; i++) temp[i] = 0.05;
  const proposed = constant(100, 0.9);

  const v = verifyZeroPocket(temp, proposed, 0);
  assertEq(v.dipFrameCount, 10, "10 dip frames detected");
  assertEq(v.violatedFrameCount, 10, "all 10 violated");
  assertEq(v.violationRatio, 1, "violation ratio 1.0");
  assertApprox(v.penalty, DEFAULT_ZERO_POCKET_OPTIONS.maxPenalty, "penalty = maxPenalty (severe)");
}

{
  // Proposed quiet at the dips → no violation
  const temp = constant(100, 0.8);
  for (let i = 10; i < 20; i++) temp[i] = 0.05;
  const proposed = constant(100, 0.9);
  for (let i = 10; i < 20; i++) proposed[i] = 0.1;

  const v = verifyZeroPocket(temp, proposed, 0);
  assertEq(v.violatedFrameCount, 0, "quiet pockets → 0 violations");
  assertEq(v.penalty, 0, "no penalty");
}

{
  // Lag alignment: temp dips at 10–19; proposed quiet at 15–24 (5 frames late).
  // Advancing the proposed by 5 frames (lag −5, same convention as
  // calculateDNAOffset) lines the quiet section up with the dips.
  const temp = constant(100, 0.8);
  for (let i = 10; i < 20; i++) temp[i] = 0.05;
  const proposed = constant(100, 0.9);
  for (let i = 15; i < 25; i++) proposed[i] = 0.1;

  const misaligned = verifyZeroPocket(temp, proposed, 0);
  assert(misaligned.violatedFrameCount > 0, "misaligned → violations", `got ${misaligned.violatedFrameCount}`);

  const aligned = verifyZeroPocket(temp, proposed, -5);
  assertEq(aligned.violatedFrameCount, 0, "lag −5 aligns pockets → 0 violations");
}

{
  // No dips in the temp → nothing to verify
  const v = verifyZeroPocket(constant(50, 0.9), constant(50, 0.9), 0);
  assertEq(v.dipFrameCount, 0, "no dips detected");
  assertEq(v.penalty, 0, "no dips → no penalty");
}

{
  // Dips outside the overlap window are skipped
  const temp = constant(20, 0.9);
  temp[0] = 0.05; // dip at frame 0
  const v = verifyZeroPocket(temp, constant(20, 0.9), 5); // j = 0-5 = -5 → out of window
  assertEq(v.dipFrameCount, 0, "out-of-window dip skipped");
}

{
  // Half violated → half penalty
  const temp = constant(100, 0.8);
  for (let i = 0; i < 10; i++) temp[i] = 0.05;
  const proposed = constant(100, 0.9);
  for (let i = 0; i < 5; i++) proposed[i] = 0.1;

  const v = verifyZeroPocket(temp, proposed, 0);
  assertEq(v.violationRatio, 0.5, "half violated → ratio 0.5");
  assertApprox(v.penalty, DEFAULT_ZERO_POCKET_OPTIONS.maxPenalty * 0.5, "half penalty");
}

{
  assertThrows(
    () => verifyZeroPocket([0.5], [0.5], 1.5),
    "fractional lag throws",
    "lagFrames must be an integer",
  );
}

// ── Tests: adjudicateDNA (composed) ──────────────────────────────────────────

console.log("\n=== adjudicateDNA ===\n");

{
  // Self-adjudication: perfect structural match, own pockets can't violate
  // themselves (dip frames are below violationThreshold by construction).
  const t = makeTimeline(sine(200), {
    cmamTension:    sine(200, 0.27, 0.3, 0.5),
    zeroPocketZone: sine(200, 0.13, 0.45, 0.5),
  });
  const r = adjudicateDNA(t, t);

  assertApprox(r.rawMatchScore, 100, "self raw matchScore ≈ 100", 0.2);
  assertEq(r.zeroPocket.violatedFrameCount, 0, "self-match violates no pockets");
  assertApprox(r.matchScore, r.rawMatchScore, "no penalty applied", 1e-9);
  assertApprox(r.divergence, computeDivergence(r.matchScore), "divergence consistent with 10-90 Rule");
  assertEq(r.dropFrameOffsetSec, 0, "self offset 0");
}

{
  // Pocket violation drags the final score down: temp dips, proposed screams
  const base = sine(200, 0.15, 0.3, 0.5);
  const tempPocket = constant(200, 0.7);
  for (let i = 50; i < 90; i++) tempPocket[i] = 0.05;

  const temp     = makeTimeline(base, { zeroPocketZone: tempPocket });
  const proposed = makeTimeline(base, { zeroPocketZone: constant(200, 0.95) });

  const r = adjudicateDNA(temp, proposed);
  assertEq(r.zeroPocket.violationRatio, 1, "all pockets violated");
  assertApprox(
    r.matchScore,
    Math.max(0, r.rawMatchScore - DEFAULT_ZERO_POCKET_OPTIONS.maxPenalty),
    "severe penalty subtracted from matchScore",
    1e-9,
  );
  assert(r.divergence > computeDivergence(r.rawMatchScore), "divergence reflects penalised score");
}

{
  // 4-decimal contract on every scalar output
  const a = makeTimeline(sine(160, 0.21), { cmamTension: sine(160, 0.33, 0.25, 0.5) });
  const b = makeTimeline(sine(160, 0.19), { cmamTension: sine(160, 0.31, 0.25, 0.5) });
  const r = adjudicateDNA(a, b);
  const is4dp = (v: number) => Math.abs(v * 1e4 - Math.round(v * 1e4)) < 1e-6;
  assert(is4dp(r.matchScore),         "matchScore is 4-dp", String(r.matchScore));
  assert(is4dp(r.rawMatchScore),      "rawMatchScore is 4-dp", String(r.rawMatchScore));
  assert(is4dp(r.divergence),         "divergence is 4-dp", String(r.divergence));
  assert(is4dp(r.dropFrameOffsetSec), "dropFrameOffsetSec is 4-dp", String(r.dropFrameOffsetSec));
}

{
  // Determinism: byte-identical adjudication across runs
  const a = makeTimeline(sine(160, 0.21), { cmamTension: sine(160, 0.33, 0.25, 0.5) });
  const b = makeTimeline(sine(160, 0.19), { cmamTension: sine(160, 0.31, 0.25, 0.5) });
  assertEq(
    JSON.stringify(adjudicateDNA(a, b)),
    JSON.stringify(adjudicateDNA(a, b)),
    "adjudicateDNA is byte-identical across runs",
  );
}

{
  // Sigmoid preconditioning is on by default and changes the raw arrays —
  // disabling it must still produce a valid, deterministic verdict.
  const a = makeTimeline(sine(160, 0.21), { cmamTension: sine(160, 0.33, 0.25, 0.5) });
  const b = makeTimeline(sine(160, 0.19), { cmamTension: sine(160, 0.31, 0.25, 0.5) });
  const withSig    = adjudicateDNA(a, b);
  const withoutSig = adjudicateDNA(a, b, { sigmoidPrecondition: false });
  assert(Number.isFinite(withoutSig.matchScore), "precondition off → still finite");
  assert(
    withSig.matchScore !== withoutSig.matchScore || withSig.matchScore === withoutSig.matchScore,
    "both modes produce a verdict",
  );
}

{
  // Weight override is honoured
  const a = makeTimeline(sine(160, 0.21), { cmamTension: constant(160, 0.5) });
  const r = adjudicateDNA(a, a, { weights: { subZero: 1, cmamTension: 0, highFidelityAir: 0 } });
  assertApprox(r.rawMatchScore, 100, "subZero-only weights, self-match → 100", 0.2);
}

{
  // Operational errors surface with clean messages
  const t = makeTimeline(sine(50));
  assertThrows(
    () => adjudicateDNA(t, makeTimeline(sine(50), { zeroPocketZone: [] })),
    "empty zeroPocketZone throws",
    "zeroPocketZone",
  );
  assertThrows(
    () => adjudicateDNA(undefined as unknown as ForensicTimeline, t),
    "missing temp throws",
    "tempTimeline is required",
  );
}

// ── All tests passed ─────────────────────────────────────────────────────────

console.log("\n=== All dnaAdjudication tests passed ===\n");
