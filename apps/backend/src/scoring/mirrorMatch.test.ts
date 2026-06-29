/**
 * Unit tests for mirrorMatch.ts scoring functions.
 *
 * Pattern: throw on failure, console.log "PASS" on success (matches project convention).
 * Run: tsx src/scoring/mirrorMatch.test.ts
 */

import {
  mean,
  stdDev,
  pearsonCorrelation,
  crossCorrelate,
  alignedSlice,
  scoreStructural,
  scoreEnergy,
  scoreHarmonic,
  computeDialogueSafety,
  computeOverall,
  computeConfidenceLevel,
  generateExplanation,
  buildCoarseEnvelope,
  buildFingerprintData,
  prefilterCandidates,
  rankCandidates,
  validateWeights,
  DEFAULT_MIRROR_WEIGHTS,
  type MirrorComponents,
  type MirrorWeights,
  type CoarseEnvelope,
  type CandidateRecord,
} from "./mirrorMatch";

import type { ForensicTimeline } from "../services/processAudio";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fail(label: string, msg: string): never {
  throw new Error(`FAIL [${label}] ${msg}`);
}

function assert(cond: boolean, label: string, msg = ""): void {
  if (!cond) fail(label, msg || "condition was false");
  console.log(`  PASS [${label}]`);
}

function assertApprox(a: number, b: number, label: string, tol = 1e-6): void {
  if (Math.abs(a - b) > tol) fail(label, `${a} ≠ ${b} (tol=${tol})`);
  console.log(`  PASS [${label}]`);
}

function assertEq<T>(a: T, b: T, label: string): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail(label, `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  }
  console.log(`  PASS [${label}]`);
}

// ── Synthetic timeline factories ──────────────────────────────────────────────

function ramp(n: number, lo = 0, hi = 1): number[] {
  return Array.from({ length: n }, (_, i) => lo + (hi - lo) * (i / (n - 1 || 1)));
}

function constant(n: number, v: number): number[] {
  return new Array<number>(n).fill(v);
}

function sineWave(n: number, freq = 0.1, amp = 0.4, offset = 0.5): number[] {
  return Array.from({ length: n }, (_, i) => amp * Math.sin(i * freq) + offset);
}

function makeTimeline(
  subZero: number[],
  zeroPocket = subZero.map(v => v * 0.5),
  presence  = subZero.map(v => 1 - v),
  tension   = subZero.map(v => v * 0.8),
): ForensicTimeline {
  return {
    subZero,
    zeroPocketZone: zeroPocket,
    presence,
    highFidelityAir: new Array(subZero.length).fill(0),
    cmamTension: tension,
  };
}

// ── Tests: mean / stdDev ─────────────────────────────────────────────────────

console.log("\n=== mean / stdDev ===\n");

assertApprox(mean([1, 2, 3, 4, 5]), 3, "mean of [1..5]");
assertApprox(mean([]), 0, "mean of empty");
assertApprox(mean([0.5, 0.5]), 0.5, "mean of constant");
assertApprox(stdDev([2, 2, 2, 2]), 0, "stdDev of constant");
assertApprox(stdDev([0, 1]), Math.sqrt(0.25), "stdDev [0,1]");
assertApprox(stdDev([]), 0, "stdDev of empty");

// ── Tests: pearsonCorrelation ─────────────────────────────────────────────────

console.log("\n=== pearsonCorrelation ===\n");

const A = ramp(20, 0, 1);
const B = ramp(20, 1, 0);  // perfectly anti-correlated

assertApprox(pearsonCorrelation(A, A),  1.0, "identity → 1.0", 1e-6);
assertApprox(pearsonCorrelation(A, B), -1.0, "anti-correlated → -1.0", 1e-6);
assertApprox(pearsonCorrelation(constant(10, 0.5), A), 0, "constant input → 0", 1e-9);
assertApprox(pearsonCorrelation([], []), 0, "empty arrays → 0", 1e-9);

// Different lengths — should use shorter
const C = ramp(10, 0, 1);
const D = ramp(20, 0, 1);
const r = pearsonCorrelation(C, D);
assert(r > 0.99, "different-length prefix correlation is high", `got ${r}`);

// ── Tests: crossCorrelate ─────────────────────────────────────────────────────

console.log("\n=== crossCorrelate ===\n");

const WAVE = sineWave(100, 0.2, 0.4, 0.5);

{
  const { correlation, lagFrames } = crossCorrelate(WAVE, WAVE);
  assert(lagFrames === 0, "identity lag = 0");
  assertApprox(correlation, 1.0, "identity correlation = 1.0", 0.01);
}

{
  // Shift WAVE by 5 frames
  const shifted = [...WAVE.slice(5), ...WAVE.slice(0, 5)];
  const { lagFrames } = crossCorrelate(WAVE, shifted);
  // The lag should be close to +5 or -5 (wrap-around)
  assert(Math.abs(lagFrames) <= 30, "lag within search bounds", `lag=${lagFrames}`);
}

{
  // Fully constant signals → both flat, correlation = 1, lag = 0
  const { correlation, lagFrames } = crossCorrelate(constant(50, 0.3), constant(50, 0.7));
  assertApprox(correlation, 1.0, "both-constant → correlation 1", 1e-6);
  assert(lagFrames === 0, "both-constant → lag 0");
}

{
  // One constant → correlation = 0
  const { correlation } = crossCorrelate(constant(50, 0.5), WAVE.slice(0, 50));
  assertApprox(correlation, 0, "one-constant → correlation 0", 1e-9);
}

// ── Tests: alignedSlice ───────────────────────────────────────────────────────

console.log("\n=== alignedSlice ===\n");

const BASE = [1, 2, 3, 4, 5];

assertEq(alignedSlice(BASE, 0, 5), [1, 2, 3, 4, 5], "lag=0 identity");
assertEq(alignedSlice(BASE, 2, 5), [0, 0, 1, 2, 3], "lag=2 shifts right");
assertEq(alignedSlice(BASE, -2, 5), [3, 4, 5, 0, 0], "lag=-2 shifts left");
assertEq(alignedSlice(BASE, 0, 3), [1, 2, 3], "shorter target");
assertEq(alignedSlice([], 0, 3), [0, 0, 0], "empty source");

// ── Tests: scoreStructural ───────────────────────────────────────────────────

console.log("\n=== scoreStructural ===\n");

{
  const t = makeTimeline(sineWave(200, 0.15, 0.3, 0.5));
  const { score, lagFrames } = scoreStructural(t, t);
  assert(score === 100, "self-structural = 100", `got ${score}`);
  assert(lagFrames === 0, "self-structural lag = 0");
}

{
  // Two very different timelines → low score
  const t1 = makeTimeline(ramp(100, 0, 1));
  const t2 = makeTimeline(ramp(100, 1, 0));
  const { score } = scoreStructural(t1, t2);
  assert(score < 50, "anti-structural < 50", `got ${score}`);
}

// ── Tests: scoreEnergy ───────────────────────────────────────────────────────

console.log("\n=== scoreEnergy ===\n");

{
  const t = makeTimeline(sineWave(200, 0.1, 0.4, 0.5));
  const result = scoreEnergy(t, t, 0);
  assert(result === 100, "self-energy at lag 0 = 100", `got ${result}`);
}

{
  // Constant subZero and presence → pearson = 0 → score should be 50 not 100
  const t1 = makeTimeline(constant(100, 0.5));
  const t2 = makeTimeline(sineWave(100, 0.3));
  const score = scoreEnergy(t1, t2, 0);
  // Since t1 is constant, pearson = 0, so raw = 0, score = (0+1)/2*100 = 50
  assertApprox(score, 50, "constant query energy → 50", 2);
}

// ── Tests: scoreHarmonic ─────────────────────────────────────────────────────

console.log("\n=== scoreHarmonic ===\n");

{
  const t = makeTimeline(sineWave(200, 0.2));
  const result = scoreHarmonic(t, t, 0);
  assert(result === 100, "self-harmonic at lag 0 = 100", `got ${result}`);
}

{
  // Fully anti-correlated tension → score near 0
  const wave = sineWave(100, 0.3, 0.4, 0.5);
  const antiWave = wave.map(v => 1 - v);
  const t1 = makeTimeline(wave, undefined, undefined, wave);
  const t2 = makeTimeline(antiWave, undefined, undefined, antiWave);
  const score = scoreHarmonic(t1, t2, 0);
  assert(score <= 5, "anti-harmonic → near 0", `got ${score}`);
}

// ── Tests: computeDialogueSafety ─────────────────────────────────────────────

console.log("\n=== computeDialogueSafety ===\n");

assertEq(
  computeDialogueSafety(makeTimeline([], constant(10, 0), [], [])),
  100,
  "all-zero zeroPocket → safety 100",
);
assertEq(
  computeDialogueSafety(makeTimeline([], constant(10, 1), [], [])),
  0,
  "all-one zeroPocket → safety 0",
);
assertEq(
  computeDialogueSafety(makeTimeline([], constant(10, 0.5), [], [])),
  50,
  "mean 0.5 → safety 50",
);

// ── Tests: computeOverall ────────────────────────────────────────────────────

console.log("\n=== computeOverall ===\n");

const perfect: MirrorComponents = { structural: 100, energy: 100, harmonic: 100, dialogueSafety: 100 };
const zero: MirrorComponents    = { structural: 0, energy: 0, harmonic: 0, dialogueSafety: 0 };

assertEq(computeOverall(perfect, DEFAULT_MIRROR_WEIGHTS), 100, "all-100 → 100");
assertEq(computeOverall(zero, DEFAULT_MIRROR_WEIGHTS), 0, "all-0 → 0");

{
  // Spot-check weighted average: structural=80, energy=60, harmonic=40, dialogue=20
  // With default weights (0.4, 0.3, 0.2, 0.1):
  // 80*0.4 + 60*0.3 + 40*0.2 + 20*0.1 = 32 + 18 + 8 + 2 = 60
  const c: MirrorComponents = { structural: 80, energy: 60, harmonic: 40, dialogueSafety: 20 };
  assertEq(computeOverall(c, DEFAULT_MIRROR_WEIGHTS), 60, "weighted spot-check = 60");
}

// ── Tests: computeConfidenceLevel ────────────────────────────────────────────

console.log("\n=== computeConfidenceLevel ===\n");

assertEq(computeConfidenceLevel(100), "HIGH",   "100 → HIGH");
assertEq(computeConfidenceLevel(70),  "HIGH",   "70  → HIGH");
assertEq(computeConfidenceLevel(69),  "MEDIUM", "69  → MEDIUM");
assertEq(computeConfidenceLevel(45),  "MEDIUM", "45  → MEDIUM");
assertEq(computeConfidenceLevel(44),  "LOW",    "44  → LOW");
assertEq(computeConfidenceLevel(0),   "LOW",    "0   → LOW");

// ── Tests: generateExplanation ───────────────────────────────────────────────

console.log("\n=== generateExplanation ===\n");

{
  const c: MirrorComponents = { structural: 85, energy: 85, harmonic: 85, dialogueSafety: 90 };
  const exp = generateExplanation(c, DEFAULT_MIRROR_WEIGHTS);
  assert(exp.includes("Strong structural arc alignment"), "high-all → mentions strong arc", exp);
  assert(exp.includes("excellent dialogue safety"), "high-dialogue → mentions dialogue safety", exp);
  assert(exp.endsWith("."), "explanation ends with period", exp);
}

{
  const c: MirrorComponents = { structural: 30, energy: 30, harmonic: 30, dialogueSafety: 30 };
  const exp = generateExplanation(c, DEFAULT_MIRROR_WEIGHTS);
  assert(exp.includes("Weak structural"), "low-all → mentions weak structural", exp);
  assert(exp.includes("voice-band energy"), "low-dialogue → warns voice-band", exp);
}

// ── Tests: buildCoarseEnvelope ───────────────────────────────────────────────

console.log("\n=== buildCoarseEnvelope ===\n");

{
  const result = buildCoarseEnvelope([], 16);
  assertEq(result, new Array(16).fill(0), "empty input → all zeros");
}

{
  // 16-element ramp → same array (one element per bin)
  const arr = ramp(16, 0, 1);
  const result = buildCoarseEnvelope(arr, 16);
  assert(result.length === 16, "output has 16 bins");
  // Each bin has exactly one element → mean = that element
  result.forEach((v, i) => {
    assertApprox(v, arr[i], `bin ${i} matches input`, 1e-4);
  });
}

{
  // 32-element constant → all bins = that constant
  const result = buildCoarseEnvelope(constant(32, 0.75), 16);
  result.forEach((v, i) => {
    assertApprox(v, 0.75, `constant bin ${i}`, 1e-5);
  });
}

{
  // Determinism check
  const arr = sineWave(100, 0.3);
  const r1 = buildCoarseEnvelope(arr);
  const r2 = buildCoarseEnvelope(arr);
  assertEq(r1, r2, "buildCoarseEnvelope is deterministic");
}

// ── Tests: buildFingerprintData ───────────────────────────────────────────────

console.log("\n=== buildFingerprintData ===\n");

{
  const t = makeTimeline(sineWave(100, 0.2));
  const fp = buildFingerprintData(t, 4.0, 25, "abc123", "2.0.0-phase1");

  assert(fp.frameCount === 100, "frameCount", `got ${fp.frameCount}`);
  assert(fp.fps === 25, "fps");
  assertApprox(fp.durationSeconds, 4.0, "durationSeconds");
  assert(fp.coarseEnvelope.subZero.length === 16, "coarse has 16 bins");
  assert("mean" in fp.bandStats.subZero, "bandStats has mean");

  // Determinism
  const fp2 = buildFingerprintData(t, 4.0, 25, "abc123", "2.0.0-phase1");
  assertEq(fp.coarseEnvelope, fp2.coarseEnvelope, "buildFingerprintData is deterministic");
}

// ── Tests: prefilterCandidates ────────────────────────────────────────────────

console.log("\n=== prefilterCandidates ===\n");

{
  const queryCoarse: CoarseEnvelope = {
    subZero:        buildCoarseEnvelope(sineWave(100, 0.1)),
    zeroPocketZone: buildCoarseEnvelope(constant(100, 0.3)),
    presence:       buildCoarseEnvelope(ramp(100, 0, 1)),
    cmamTension:    buildCoarseEnvelope(sineWave(100, 0.2)),
  };

  const exact: CoarseEnvelope = { ...queryCoarse };
  const noise: CoarseEnvelope = {
    subZero:        buildCoarseEnvelope(constant(100, 0.9)),
    zeroPocketZone: buildCoarseEnvelope(constant(100, 0.1)),
    presence:       buildCoarseEnvelope(ramp(100, 1, 0)),
    cmamTension:    buildCoarseEnvelope(constant(100, 0.5)),
  };

  const candidates = [
    { id: "noise", coarseEnvelope: noise },
    { id: "exact", coarseEnvelope: exact },
  ];

  const top = prefilterCandidates(queryCoarse, candidates, 2);
  assert(top[0].id === "exact", "pre-filter: self-match ranks first", `first=${top[0].id}`);
}

{
  // topN cap
  const ce: CoarseEnvelope = {
    subZero: buildCoarseEnvelope(constant(100, 0.5)),
    zeroPocketZone: buildCoarseEnvelope(constant(100, 0.5)),
    presence: buildCoarseEnvelope(constant(100, 0.5)),
    cmamTension: buildCoarseEnvelope(constant(100, 0.5)),
  };
  const many = Array.from({ length: 100 }, (_, i) => ({ id: String(i), coarseEnvelope: ce }));
  const filtered = prefilterCandidates(ce, many, 10);
  assert(filtered.length === 10, "topN cap respected", `got ${filtered.length}`);
}

// ── Tests: rankCandidates ────────────────────────────────────────────────────

console.log("\n=== rankCandidates ===\n");

{
  const t1 = makeTimeline(sineWave(200, 0.15, 0.3, 0.5));
  const t2 = makeTimeline(ramp(200, 0, 1));
  const t3 = makeTimeline(ramp(200, 1, 0));

  const candidates: CandidateRecord[] = [
    { trackId: "T2", trackTitle: "Ramp Up",   artistName: null, fps: 25, inputHash: "h2", fullTimeline: t2 },
    { trackId: "T3", trackTitle: "Ramp Down", artistName: null, fps: 25, inputHash: "h3", fullTimeline: t3 },
    { trackId: "T1", trackTitle: "Sine",      artistName: null, fps: 25, inputHash: "h1", fullTimeline: t1 },
  ];

  const results = rankCandidates(t1, "query-hash", candidates, DEFAULT_MIRROR_WEIGHTS);

  assert(results.length === 3, "all candidates returned");
  assert(results[0].trackId === "T1", "self-match ranks #1", `got ${results[0].trackId}`);
  // overall = structural*0.4 + energy*0.3 + harmonic*0.2 + dialogueSafety*0.1
  // dialogueSafety depends on zeroPocket mean (not a self-match property), so
  // overall ∈ [90, 100] for a perfect structural self-match.
  assert(results[0].overall >= 90, "self-match overall ≥ 90", `got ${results[0].overall}`);
  assertEq(results[0].components.structural, 100, "self-match structural = 100");
  assertEq(results[0].components.energy,     100, "self-match energy     = 100");
  assertEq(results[0].components.harmonic,   100, "self-match harmonic   = 100");
  assert(results[0].confidence === "HIGH", "self-match confidence = HIGH");
  assert(results[0].alignmentOffsetSecs === 0, "self-match lag = 0");

  // Results are sorted descending
  for (let i = 0; i < results.length - 1; i++) {
    assert(
      results[i].overall >= results[i + 1].overall,
      `results[${i}].overall ≥ results[${i + 1}].overall`,
      `${results[i].overall} < ${results[i + 1].overall}`,
    );
  }
}

{
  // Determinism: same inputs → same outputs
  const t = makeTimeline(sineWave(100, 0.2));
  const cands: CandidateRecord[] = [
    { trackId: "X", trackTitle: "X", artistName: null, fps: 25, inputHash: "hx", fullTimeline: t },
  ];
  const r1 = rankCandidates(t, "qh", cands, DEFAULT_MIRROR_WEIGHTS);
  const r2 = rankCandidates(t, "qh", cands, DEFAULT_MIRROR_WEIGHTS);
  assertEq(r1[0].overall,             r2[0].overall,             "determinism: overall");
  assertEq(r1[0].components,          r2[0].components,          "determinism: components");
  assertEq(r1[0].alignmentOffsetSecs, r2[0].alignmentOffsetSecs, "determinism: lag");
  assertEq(r1[0].inputHash,           r2[0].inputHash,           "determinism: inputHash");
}

{
  // Empty candidates → empty results
  const t = makeTimeline(sineWave(50, 0.1));
  const results = rankCandidates(t, "qh", []);
  assertEq(results, [], "empty candidates → empty results");
}

// ── Tests: validateWeights ───────────────────────────────────────────────────

console.log("\n=== validateWeights ===\n");

assert(validateWeights(DEFAULT_MIRROR_WEIGHTS), "default weights sum to 1");
assert(!validateWeights({ structural: 0.5, energy: 0.5, harmonic: 0.1, dialogue: 0.1 }),
  "0.5+0.5+0.1+0.1 = 1.2 fails");

// ── All tests passed ─────────────────────────────────────────────────────────

console.log("\n=== All mirrorMatch tests passed ===\n");
