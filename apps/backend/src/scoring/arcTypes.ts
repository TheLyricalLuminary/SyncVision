/**
 * arcTypes.ts — shared types and constants for the Scene Arc engine.
 *
 * A "scene arc" is an emotional shape extracted from a scene description. v1
 * EXPOSES four named phases:
 *
 *   Opening  →  Held Breath  →  Turn  →  Release
 *
 * …but the engine represents an arc internally as a plain `ArcVec = number[]`
 * (a curve sampled at N points). Four is just v1's resolution. The curve can be
 * resampled to 8 / 16 / 512 points to align with a song's 512-point timeline in
 * a later session. Keep the UI at 4; keep the engine expandable. Do NOT hard-wire
 * downstream code to exactly four buckets.
 *
 * Each arc carries TWO curves:
 *   - a MAGNITUDE curve (0–100): how intense the moment is (tension/energy)
 *   - a VALENCE curve (−100…+100): emotional direction (grief vs triumph)
 * Magnitude alone cannot tell forgiveness from revenge — polarity can.
 *
 * Determinism rule: never iterate an object's keys for arc math. Index through
 * arrays so order is fixed and platform-stable.
 */

export const PHASES = ["opening", "heldBreath", "turn", "release"] as const;
export type Phase = (typeof PHASES)[number];

/** v1 resolution. The engine computes at this many points; resample for more. */
export const PHASE_COUNT = PHASES.length;

/** A variable-length curve. Indices map to phases at the canonical resolution. */
export type ArcVec = number[];

/** The four named phases as a record — the v1 public/API surface. */
export interface Arc {
  opening: number;
  heldBreath: number;
  turn: number;
  release: number;
}

export function vecToArc(v: ArcVec): Arc {
  return { opening: v[0], heldBreath: v[1], turn: v[2], release: v[3] };
}

export function arcToVec(a: Arc): ArcVec {
  return [a.opening, a.heldBreath, a.turn, a.release];
}

/**
 * Linear resample of a curve to `n` points (mirrors analyze.py's resample_to_512
 * so scene and song arcs can be compared at a common resolution later).
 * Deterministic; n>=1.
 */
export function resampleCurve(curve: ArcVec, n: number): ArcVec {
  const len = curve.length;
  if (n <= 0 || len === 0) return [];
  if (len === 1) return new Array(n).fill(curve[0]);
  if (n === 1) return [curve[0]];
  const out: ArcVec = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (len - 1);
    const lo = Math.floor(x);
    const hi = Math.min(len - 1, lo + 1);
    const frac = x - lo;
    out[i] = curve[lo] + (curve[hi] - curve[lo]) * frac;
  }
  return out;
}

/**
 * Map a sentence index (within a scene of `total` sentences) to one of the four
 * phases by relative position. A 4-sentence scene maps cleanly 0→opening …
 * 3→release; other counts distribute proportionally.
 */
export function sentencePhaseIndex(index: number, total: number): number {
  if (total <= 1) return 0;
  const p = Math.floor((index / total) * PHASE_COUNT);
  return p < 0 ? 0 : p > PHASE_COUNT - 1 ? PHASE_COUNT - 1 : p;
}

/** Human-readable labels for detected narrative-event signal ids. */
export const SIGNAL_LABELS: Record<string, string> = {
  establishing: "Establishing",
  reunion: "Reunion",
  reconciliation: "Reconciliation",
  arrival: "Arrival",
  introduction: "Introduction",
  longing: "Longing",
  tension: "Tension",
  restraint: "Restraint",
  grief: "Grief",
  dread: "Dread",
  waiting: "Waiting",
  doubt: "Doubt",
  isolation: "Isolation",
  stillness: "Stillness",
  chase: "Chase",
  pursuit: "Pursuit",
  fight: "Fight",
  threat: "Threat",
  breakdown: "Breakdown",
  realization: "Realization",
  confession: "Confession",
  revelation: "Revelation",
  betrayal: "Betrayal",
  revenge: "Revenge",
  confrontation: "Confrontation",
  ultimatum: "Ultimatum",
  decision: "Decision",
  climax: "Climax",
  death: "Death",
  sacrifice: "Sacrifice",
  escape: "Escape",
  victory: "Victory",
  forgiveness: "Forgiveness",
  resolution: "Resolution",
  acceptance: "Acceptance",
  redemption: "Redemption",
  farewell: "Farewell",
  catharsis: "Catharsis",
  homecoming: "Homecoming",
  kiss: "Embrace",
  celebration: "Celebration",
  joy: "Joy",
  comedy: "Comic Beat",
  horror: "Horror",
  triumph: "Triumph",
};

export function signalLabel(id: string): string {
  return SIGNAL_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}
