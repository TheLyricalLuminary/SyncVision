/**
 * songArcReduction.ts — reduces a track's 512-point timeline into a 4-phase
 * SongArc comparable to the SceneArc produced by arcExtraction.ts.
 *
 * Design contract (same as scene arc):
 *   - Same trackId + identical timeline → identical SongArc, always. No randomness.
 *   - All math uses indexed arrays, never object key order.
 *   - Dimension indices match analyze.py's stack order: [valence, arousal, tension,
 *     dominance, intimacy] — these are AUDIO features, not PAD emotional ratings.
 *
 * Timeline column semantics (all [0,1]):
 *   0 valence   = spectral centroid normalised → brightness proxy
 *   1 arousal   = RMS energy normalised        → intensity proxy
 *   2 tension   = spectral contrast normalised → drama/conflict proxy
 *   3 dominance = 1 − ZCR normalised           → presence/fullness proxy
 *   4 intimacy  = 1 − bandwidth normalised     → warmth/closeness proxy
 *
 * Phase split: equal quarters (128 frames each at 512 resolution). This is the
 * v1 default — a more nuanced energy-peak-driven segmentation is a v2 option.
 *
 * Magnitude formula: 0.5·arousal + 0.3·tension + 0.2·dominance → [0,1] → ×100.
 * Valence formula:   (brightness − 0.5) × 200 → [−100, 100].
 *   (Spectral centroid brightness is a coarse proxy for emotional valence;
 *   it will be combined with scene-arc valenceCurve in Session C matching.)
 *
 * LEXICON_VERSION is shared with the scene arc — bump it if this formula changes,
 * so downstream cached arc comparisons can be invalidated.
 */

import { createHash } from "crypto";
import { PHASES, PHASE_COUNT } from "./arcTypes";
import { LEXICON_VERSION } from "./arcLexicon";

// ── Types ────────────────────────────────────────────────────────────────────

/** Dimension column indices in the 512×5 timeline matrix. */
const DIM = {
  VALENCE:   0,
  AROUSAL:   1,
  TENSION:   2,
  DOMINANCE: 3,
  INTIMACY:  4, // not used in v1 magnitude; reserved
} as const;

/** Weights for composite magnitude. Σ must equal 1.0. */
const MAG_W = {
  AROUSAL:   0.5,
  TENSION:   0.3,
  DOMINANCE: 0.2,
} as const;

export interface SongArc {
  opening:     number;   // 0–100 magnitude
  heldBreath:  number;
  turn:        number;
  release:     number;
  curve:       number[]; // [opening, heldBreath, turn, release] — same as SceneArc
  valenceCurve: number[]; // signed brightness direction per phase, −100…+100
  trackId:     string;
  lexiconVersion: string;
  arcHash:     string;   // sha256 of {trackId + timeline fingerprint}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp0100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampSigned(n: number): number {
  return Math.max(-100, Math.min(100, Math.round(n)));
}

/** Stable JSON — consistent key order so sha256 is deterministic. */
function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

/**
 * A lightweight fingerprint of the timeline: the first and last 4 values of
 * each dimension's mean, plus overall frame count. Cheap to compute, stable,
 * and sufficient to detect any timeline substitution.
 */
function timelineFingerprint(timeline: number[][]): Record<string, number> {
  const n = timeline.length;
  if (n === 0) return { n: 0 };
  const dims = 5;
  const fp: Record<string, number> = { n };
  for (let d = 0; d < dims; d++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += (timeline[i]?.[d] ?? 0);
    fp[`d${d}mean`] = Math.round((sum / n) * 1e6) / 1e6;
  }
  // Include first and last frame for shape sensitivity
  fp["first"] = Math.round((timeline[0] ?? []).reduce((s, v) => s + v, 0) * 1e6) / 1e6;
  fp["last"]  = Math.round((timeline[n - 1] ?? []).reduce((s, v) => s + v, 0) * 1e6) / 1e6;
  return fp;
}

function buildHash(trackId: string, timeline: number[][]): string {
  const stable = sortedJson({ lexiconVersion: LEXICON_VERSION, trackId, fp: timelineFingerprint(timeline) });
  return createHash("sha256").update(stable).digest("hex");
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Reduce a 512×5 audio timeline into a 4-phase SongArc.
 *
 * @param timeline  N×5 matrix from Track.timeline (N may vary; 512 is nominal).
 *                  All values expected in [0,1].
 * @param trackId   The track's database id — included in the arcHash for traceability.
 *
 * Returns a SongArc with the same phase structure as a SceneArc so the two can
 * be compared directly in Session C (Arc Match).
 */
export function computeSongArc(timeline: number[][], trackId: string): SongArc {
  // Guard: if timeline is missing or too short, return a flat neutral arc
  if (!timeline || timeline.length < PHASE_COUNT) {
    const flat = PHASES.map(() => 50) as [number, number, number, number];
    return {
      opening: flat[0], heldBreath: flat[1], turn: flat[2], release: flat[3],
      curve: [...flat], valenceCurve: [0, 0, 0, 0],
      trackId, lexiconVersion: LEXICON_VERSION,
      arcHash: buildHash(trackId, []),
    };
  }

  const n = timeline.length;
  // Phase boundaries: equal-width quarters of whatever N we have.
  // PHASE_COUNT = 4; each phase is Math.floor(n/4) frames, last phase gets remainder.
  const phaseSize = Math.floor(n / PHASE_COUNT);

  const magAcc  = new Array<number>(PHASE_COUNT).fill(0);
  const valAcc  = new Array<number>(PHASE_COUNT).fill(0);
  const counts  = new Array<number>(PHASE_COUNT).fill(0);

  for (let i = 0; i < n; i++) {
    const row = timeline[i];
    if (!row) continue;

    const phaseIdx = Math.min(PHASE_COUNT - 1, Math.floor(i / phaseSize));

    const mag = (
      MAG_W.AROUSAL   * (row[DIM.AROUSAL]   ?? 0) +
      MAG_W.TENSION   * (row[DIM.TENSION]   ?? 0) +
      MAG_W.DOMINANCE * (row[DIM.DOMINANCE] ?? 0)
    );
    const brightness = row[DIM.VALENCE] ?? 0;

    magAcc[phaseIdx] += mag;
    valAcc[phaseIdx] += brightness;
    counts[phaseIdx]++;
  }

  // Derive per-phase magnitude (0–100) and valence (−100…+100)
  const curve        = PHASES.map((_, i) => {
    const c = counts[i];
    if (c === 0) return 50; // neutral fallback
    return clamp0100((magAcc[i] / c) * 100);
  });
  const valenceCurve = PHASES.map((_, i) => {
    const c = counts[i];
    if (c === 0) return 0;
    const brightness = valAcc[i] / c; // [0,1]
    return clampSigned((brightness - 0.5) * 200); // maps 0→-100, 0.5→0, 1→+100
  });

  return {
    opening:    curve[0],
    heldBreath: curve[1],
    turn:       curve[2],
    release:    curve[3],
    curve,
    valenceCurve,
    trackId,
    lexiconVersion: LEXICON_VERSION,
    arcHash: buildHash(trackId, timeline),
  };
}
