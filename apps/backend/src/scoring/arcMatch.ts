/**
 * arcMatch.ts — Arc Match similarity between a SceneArc and a SongArc.
 *
 * Both arcs share the same four-phase structure:
 *   Opening  Held Breath  Turn  Release   (each 0–100 magnitude)
 * Both also carry a valenceCurve (−100…+100 per phase).
 *
 * Two components:
 *
 *   magnitudeScore (0–100): weighted L2 shape similarity.
 *     Turn and Release carry more weight — they define the story's pivot
 *     and payoff, which are the most placement-critical moments.
 *     Phase weights: Opening 0.20, HeldBreath 0.20, Turn 0.30, Release 0.30.
 *
 *   valenceScore (0–100): per-phase emotional direction alignment.
 *     A grief-to-forgiveness scene (dark→bright arc) should prefer songs
 *     with a matching dark-early/bright-late valence trajectory.
 *     Per phase: 50 % direction-sign agreement + 50 % magnitude proximity.
 *
 *   combinedScore (0–100): 0.65 · magnitude + 0.35 · valence.
 *     Shape dominates because magnitude structure is the primary story signal;
 *     valence provides the emotional-direction correction that prevents
 *     "forgiveness" and "revenge" arcs from matching the same songs.
 *
 * Design contract: pure function, no IO, no randomness, no Date.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** The arc fields required for matching — both SceneArc and SongArc satisfy this. */
export interface MatchableArc {
  opening:     number;
  heldBreath:  number;
  turn:        number;
  release:     number;
  valenceCurve: number[];
}

export interface ArcMatchResult {
  magnitudeScore: number; // 0–100 shape similarity
  valenceScore:   number; // 0–100 direction alignment
  combinedScore:  number; // 0–100 final match quality
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Phase weights for magnitude similarity. Must Σ = 1.0. */
const MAG_WEIGHTS = [0.20, 0.20, 0.30, 0.30]; // [O, HB, T, R]

/** Blend between magnitude and valence components. */
const BLEND_MAG    = 0.65;
const BLEND_VAL    = 0.35;

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

// ── Core ────────────────────────────────────────────────────────────────────

/**
 * Compute the arc match score between a scene arc and a song arc.
 *
 * Both arcs must have the same four-phase structure. Neither arc is normalised
 * by the caller — this function normalises internally.
 *
 * Returns `null` if either arc is null (graceful no-op for callers that may
 * not have a scene arc yet).
 */
export function matchArcs(
  scene: MatchableArc | null | undefined,
  song:  MatchableArc | null | undefined,
): ArcMatchResult | null {
  if (!scene || !song) return null;

  const sceneVec  = [scene.opening, scene.heldBreath, scene.turn, scene.release];
  const songVec   = [song.opening,  song.heldBreath,  song.turn,  song.release];

  // ── Magnitude similarity ──────────────────────────────────────────────────
  // Weighted L2 on [0,1]-normalised phases.
  // Max weighted distance when one arc is all-0 and the other all-100:
  //   sqrt( Σ weight_i * 1.0² ) = sqrt(Σ weight_i) = sqrt(1.0) = 1.0
  // So we don't need an extra denominator — it's already bounded [0,1].
  let weightedSqSum = 0;
  for (let i = 0; i < 4; i++) {
    const diff = (sceneVec[i] - songVec[i]) / 100; // normalise to [−1, 1]
    weightedSqSum += MAG_WEIGHTS[i] * diff * diff;
  }
  const magDist = Math.sqrt(weightedSqSum); // [0, 1]
  const magnitudeScore01 = clamp01(1 - magDist);

  // ── Valence alignment ────────────────────────────────────────────────────
  // Per-phase: blend of (a) direction-sign agreement and (b) magnitude proximity.
  // sign(0) is treated as positive so neutral phases don't penalise either direction.
  const sceneVC = scene.valenceCurve;
  const songVC  = song.valenceCurve;
  let valSum = 0;
  const phases = Math.min(4, sceneVC.length, songVC.length);

  for (let i = 0; i < phases; i++) {
    const sv = sceneVC[i] ?? 0;
    const gv = songVC[i]  ?? 0;
    // Direction: +1 when both same sign (or either is 0), −1 when opposite
    const signAgree = (sv >= 0 && gv >= 0) || (sv <= 0 && gv <= 0) ? 1.0 : 0.0;
    const proximity = clamp01(1 - Math.abs(sv - gv) / 200); // [0, 1]
    valSum += 0.5 * signAgree + 0.5 * proximity;
  }
  const valenceScore01 = phases > 0 ? clamp01(valSum / phases) : 0.5;

  const combined01 = BLEND_MAG * magnitudeScore01 + BLEND_VAL * valenceScore01;

  return {
    magnitudeScore: round100(magnitudeScore01),
    valenceScore:   round100(valenceScore01),
    combinedScore:  round100(combined01),
  };
}
