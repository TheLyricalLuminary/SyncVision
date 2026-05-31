import { calculateConfidenceScore, Track, RightsProfile } from "./confidenceScore";

// ── Fixtures ────────────────────────────────────────────────────────────────

const TRACK: Track = {
  id: "track-001",
  title: "Blue Horizon",
  isrc: "USRC10000001",
};

const RIGHTS: RightsProfile = {
  id: "rights-001",
  trackId: "track-001",
  ascapWorkId: "123456789",
  masterOwnershipPct: 100,
  isOneStop: true,
  writerName: "Jane Doe",
  writerIpi: "00000000250",
  publisherName: "Horizon Music Publishing",
  proAffiliation: "ASCAP",
};

// ── Determinism test ─────────────────────────────────────────────────────────

function assertEqual<T>(a: T, b: T, label: string): void {
  const aStr = JSON.stringify(a);
  const bStr = JSON.stringify(b);
  if (aStr !== bStr) {
    throw new Error(`FAIL [${label}]\n  run1: ${aStr}\n  run2: ${bStr}`);
  }
  console.log(`  PASS [${label}]`);
}

function runDeterminismTest(): void {
  console.log("\n=== Determinism test: calculateConfidenceScore ===\n");

  const run1 = calculateConfidenceScore(TRACK, RIGHTS);
  const run2 = calculateConfidenceScore(TRACK, RIGHTS);

  assertEqual(run1.score, run2.score, "score");
  assertEqual(run1.inputHash, run2.inputHash, "inputHash");
  assertEqual(run1.breakdown.rightsAndProvenance, run2.breakdown.rightsAndProvenance, "breakdown.rightsAndProvenance");
  assertEqual(run1.breakdown.metadataCompleteness, run2.breakdown.metadataCompleteness, "breakdown.metadataCompleteness");
  assertEqual(run1.breakdown.audioQuality, run2.breakdown.audioQuality, "breakdown.audioQuality");
  assertEqual(run1.breakdown.sceneFit, run2.breakdown.sceneFit, "breakdown.sceneFit");
  assertEqual(run1.breakdown.total, run2.breakdown.total, "breakdown.total");
  assertEqual(run1.breakdown.confidenceLabel, run2.breakdown.confidenceLabel, "breakdown.confidenceLabel");
  assertEqual(run1.breakdown.explanation, run2.breakdown.explanation, "breakdown.explanation");
  assertEqual(run1.breakdown.detail, run2.breakdown.detail, "breakdown.detail");

  console.log("\n=== Scoring logic spot-checks ===\n");

  // Full rights + metadata, but no audio analysis yet → 85
  // (audioQuality=0, sceneFit=0 — points require actual audio feature data)
  console.log(`  score=${run1.score}  (expected 85)`);
  if (run1.score !== 85) throw new Error(`FAIL: expected score 85, got ${run1.score}`);
  console.log("  PASS [full rights + metadata, no audio → score 85]");

  if (run1.breakdown.confidenceLabel !== "HIGH") throw new Error(`FAIL: expected HIGH, got ${run1.breakdown.confidenceLabel}`);
  console.log("  PASS [label = HIGH]");

  // No ISRC → loses 20 pts → 65
  const noIsrc = calculateConfidenceScore({ ...TRACK, isrc: null }, RIGHTS);
  if (noIsrc.score !== 65) throw new Error(`FAIL: expected 65, got ${noIsrc.score}`);
  console.log("  PASS [missing ISRC → score 65]");

  // Bad ISRC format → loses 20 pts → 65
  const badIsrc = calculateConfidenceScore({ ...TRACK, isrc: "bad-isrc" }, RIGHTS);
  if (badIsrc.score !== 65) throw new Error(`FAIL: expected 65, got ${badIsrc.score}`);
  console.log("  PASS [invalid ISRC → score 65]");

  // masterOwnershipPct = 99.99 → loses 15 pts → 70
  const partial = calculateConfidenceScore(TRACK, { ...RIGHTS, masterOwnershipPct: 99.99 });
  if (partial.score !== 70) throw new Error(`FAIL: expected 70, got ${partial.score}`);
  console.log("  PASS [ownership 99.99 → score 70]");

  // isOneStop = false → loses 15 pts → 70
  const noOneStop = calculateConfidenceScore(TRACK, { ...RIGHTS, isOneStop: false });
  if (noOneStop.score !== 70) throw new Error(`FAIL: expected 70, got ${noOneStop.score}`);
  console.log("  PASS [isOneStop false → score 70]");

  // Empty rights profile, no audio → score = 0 (no rights, no metadata, no audio features)
  const empty = calculateConfidenceScore(
    { id: "t2", title: "Ghost", isrc: null },
    { id: "r2", trackId: "t2" }
  );
  if (empty.score !== 0) throw new Error(`FAIL: expected 0, got ${empty.score}`);
  if (empty.breakdown.confidenceLabel !== "LOW") throw new Error(`FAIL: expected LOW`);
  console.log("  PASS [empty profile, no audio → score 0, label LOW]");

  // String masterOwnershipPct = "100" (Prisma Decimal over JSON) → 85
  const stringPct = calculateConfidenceScore(TRACK, { ...RIGHTS, masterOwnershipPct: "100" });
  if (stringPct.score !== 85) throw new Error(`FAIL: expected 85, got ${stringPct.score}`);
  console.log('  PASS [masterOwnershipPct "100" (string) → score 85]');

  console.log("\nAll tests passed.\n");
}

runDeterminismTest();
