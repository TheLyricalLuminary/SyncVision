/**
 * arcMatch.test.ts — unit tests for the Arc Match similarity function.
 *
 * Run: npx tsx src/scoring/arcMatch.test.ts
 */

import { matchArcs, type MatchableArc } from "./arcMatch";

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

function arc(o: number, hb: number, t: number, r: number, vc = [0,0,0,0]): MatchableArc {
  return { opening: o, heldBreath: hb, turn: t, release: r, valenceCurve: vc };
}

// ── Fixture 1: Identical arcs → perfect score ─────────────────────────────────
{
  console.log("\n── Fixture 1: identical arcs ──");
  const a = arc(50, 45, 78, 88, [-10, -20, 10, 60]);
  const result = matchArcs(a, a)!;
  assert("magnitudeScore = 100", result.magnitudeScore === 100, `got ${result.magnitudeScore}`);
  assert("valenceScore = 100",   result.valenceScore   === 100, `got ${result.valenceScore}`);
  assert("combinedScore = 100",  result.combinedScore  === 100, `got ${result.combinedScore}`);
}

// ── Fixture 2: Perfectly opposed arcs → low score ────────────────────────────
{
  console.log("\n── Fixture 2: opposed arcs (forgiveness vs revenge shape) ──");
  // Forgiveness arc: dip → rise → bright peak
  const forgiveness = arc(50, 30, 75, 90, [-20, -30,  10,  80]);
  // Revenge arc:     quiet → spike → dark resolution
  const revenge     = arc(40, 85, 95, 20, [-10, -20, -80, -90]);
  const result = matchArcs(forgiveness, revenge)!;
  assert("magnitudeScore < 60", result.magnitudeScore < 60, `got ${result.magnitudeScore}`);
  assert("valenceScore < 60",   result.valenceScore   < 60, `got ${result.valenceScore}`);
  assert("combinedScore < 60",  result.combinedScore  < 60, `got ${result.combinedScore}`);
}

// ── Fixture 3: Good shape match, wrong valence → lower combined ───────────────
{
  console.log("\n── Fixture 3: shape match + valence mismatch ──");
  const scene = arc(50, 45, 78, 88, [-20, -30, 10, 80]); // dark→bright (forgiveness)
  const songGood = arc(48, 43, 75, 85, [-15, -25, 15, 75]); // same direction
  const songBad  = arc(48, 43, 75, 85, [ 20,  30,-10,-70]); // good shape, OPPOSITE valence

  const good = matchArcs(scene, songGood)!;
  const bad  = matchArcs(scene, songBad)!;

  assert("same shape → magnitudeScores equal", good.magnitudeScore === bad.magnitudeScore,
    `good=${good.magnitudeScore} bad=${bad.magnitudeScore}`);
  assert("correct valence → higher combinedScore", good.combinedScore > bad.combinedScore,
    `good=${good.combinedScore} bad=${bad.combinedScore}`);
  assert("valence mismatch penalises combined", bad.combinedScore < good.combinedScore);
}

// ── Fixture 4: Null inputs → null result (graceful no-op) ─────────────────────
{
  console.log("\n── Fixture 4: null inputs ──");
  assert("null scene → null", matchArcs(null, arc(50,50,50,50)) === null);
  assert("null song  → null", matchArcs(arc(50,50,50,50), null) === null);
  assert("both null  → null", matchArcs(null, null) === null);
}

// ── Fixture 5: Score is in [0, 100] for arbitrary arcs ────────────────────────
{
  console.log("\n── Fixture 5: all arcs → [0,100] output range ──");
  const pairs: [MatchableArc, MatchableArc][] = [
    [arc(0,0,0,0), arc(100,100,100,100)],
    [arc(100,0,100,0), arc(0,100,0,100)],
    [arc(50,50,50,50), arc(51,49,52,48)],
    [arc(30,80,90,10, [-100,-100,-100,-100]), arc(70,20,10,90, [100,100,100,100])],
  ];
  for (const [a1, a2] of pairs) {
    const r = matchArcs(a1, a2)!;
    assert(`magnitude in [0,100]`, r.magnitudeScore >= 0 && r.magnitudeScore <= 100, `${r.magnitudeScore}`);
    assert(`valence in [0,100]`,   r.valenceScore   >= 0 && r.valenceScore   <= 100, `${r.valenceScore}`);
    assert(`combined in [0,100]`,  r.combinedScore  >= 0 && r.combinedScore  <= 100, `${r.combinedScore}`);
  }
}

// ── Fixture 6: Golden fixture — brothers/funeral scene vs a matching song ──────
{
  console.log("\n── Fixture 6: golden scene arc vs crescendo song (should match well) ──");
  // The golden scene: dip at HB, peak at Release, bright valence at end
  const sceneArc  = arc(50, 45, 78, 88, [-30, -40,  5, 70]);
  // A song that crescendos gently and ends bright → good match
  const goodSong  = arc(42, 38, 70, 85, [-20, -30, 10, 65]);
  // A song that decrescendos and ends dark → bad match
  const badSong   = arc(88, 80, 50, 30, [ 30,  20,-10,-60]);

  const goodResult = matchArcs(sceneArc, goodSong)!;
  const badResult  = matchArcs(sceneArc, badSong)!;

  assert("crescendo song scores higher than decrescendo", goodResult.combinedScore > badResult.combinedScore,
    `good=${goodResult.combinedScore} bad=${badResult.combinedScore}`);
  assert("good match scores > 70", goodResult.combinedScore > 70,
    `got ${goodResult.combinedScore}`);
  assert("bad match scores < 50",  badResult.combinedScore  < 50,
    `got ${badResult.combinedScore}`);
}

// ── Fixture 7: Symmetric — matchArcs(a,b) == matchArcs(b,a) ──────────────────
{
  console.log("\n── Fixture 7: symmetry ──");
  const a = arc(50, 30, 80, 90, [-30, -10, 20, 70]);
  const b = arc(60, 55, 70, 75, [-20,   5, 30, 50]);
  const ab = matchArcs(a, b)!;
  const ba = matchArcs(b, a)!;
  assert("combined symmetric", ab.combinedScore === ba.combinedScore,
    `ab=${ab.combinedScore} ba=${ba.combinedScore}`);
  assert("magnitude symmetric", ab.magnitudeScore === ba.magnitudeScore);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
