/**
 * Temp Track DNA Adjudication Engine (Phase 2)
 *
 * Compares a Proposed Track's forensic DNA against a Temp Track's DNA using
 * pure deterministic cross-correlation. No AI models, no probabilistic
 * inference — every output is reproducible bit-for-bit from its inputs.
 *
 * Pipeline:
 *   1. Sigmoid pre-conditioning  — expand variance of raw band envelopes
 *   2. calculateDNAOffset        — joint lag sweep over Sub-Zero + CMAM + Air
 *   3. verifyZeroPocket          — frame-aligned dialogue-pocket violation check
 *   4. adjudicateDNA             — composed verdict: matchScore, divergence,
 *                                  dropFrameOffsetSec (all 4-decimal floats)
 *
 * This module also owns the forensic math primitives that previously lived in
 * routes/scores.ts (normalizeSigmoid, computeDivergence, applyZeroPocketPenalty)
 * so they can be unit-tested without importing the Express/Prisma route layer.
 */

import type { ForensicTimeline } from "../services/processAudio";

// ─────────────────────────────────────────────────────────────────────────────
// Forensic Math — Sigmoid Expansion · Divergence Guard · Zero-Pocket Penalty
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalized sigmoid: maps x ∈ [0,1] → [0,1] with a steepened S-curve.
 *
 * An uncorrected σ(x) on a [0,1] input only spans [0.500, 0.731] — a 23-point
 * output range that compresses contrast between middle-scoring tracks and
 * causes the "Sigmoid Compression Trap" (score pile-ups at e.g. a 70-tie).
 *
 * This corrected form sets gain k=10 and midpoint x0=0.5 so the inflection sits
 * at the center of the input range, then applies min-max scaling to force exact
 * [0,1] output:
 *
 *   g(X) = 1 / (1 + exp(-k · (X - x0)))
 *   normalizeSigmoid(X) = (g(X) - g(0)) / (g(1) - g(0))
 *
 * Verified boundary values: normalizeSigmoid(0)=0, normalizeSigmoid(0.5)=0.5,
 * normalizeSigmoid(1)=1.  Monotonic — rank ordering is preserved.
 * Rounded to 4 decimal places to cap floating-point drift.
 */
export function normalizeSigmoid(x: number, k = 10.0, x0 = 0.50): number {
  const clamp = Math.max(0, Math.min(1, x));
  const g = (v: number) => 1 / (1 + Math.exp(-k * (v - x0)));
  const g0 = g(0);
  const g1 = g(1);
  const raw = (g(clamp) - g0) / (g1 - g0);
  return Math.round(Math.max(0, Math.min(1, raw)) * 1e4) / 1e4;
}

/**
 * Element-wise sigmoid expansion of a raw band envelope.
 * Applied to DNA band arrays before cross-correlation to widen the variance
 * between quiet and loud passages, sharpening the correlation peak.
 */
export function sigmoidExpandArray(arr: readonly number[], k = 10.0, x0 = 0.50): number[] {
  return arr.map(v => normalizeSigmoid(v, k, x0));
}

/**
 * 10-90 Rule divergence.
 *
 *   divergence = 90 − (matchScore / 100 × 80)
 *
 * At matchScore = 100 ("Mickey-Mousing"): divergence = 10 — the music exactly
 * mirrors the on-screen action, and the replacement sits close enough to the
 * temp to raise plagiarism review. At matchScore = 70: divergence = 34 —
 * "sophisticated counterpoint". At matchScore = 0: divergence = 90 — no
 * structural relationship.
 *
 * Rounded to 4 decimal places.
 */
export function computeDivergence(matchScore: number): number {
  return Math.round((90 - (matchScore / 100) * 80) * 1e4) / 1e4;
}

/**
 * Zero-Pocket Dialogue Penalty (scalar form).
 *
 * Scene-level penalty for the brief-ranking route: a track with high mean
 * energy in the 300–3 000 Hz voice band played under dense dialogue masks the
 * actors. Max penalty 30 points. Rounded to 4 decimal places.
 *
 * For temp-track adjudication use verifyZeroPocket instead — it compares the
 * two tracks frame-by-frame at the aligned offset rather than by scene means.
 */
export function applyZeroPocketPenalty(
  matchScore:      number,
  zeroPocketMean:  number,
  dialogueDensity: number,
): number {
  if (dialogueDensity <= 0 || zeroPocketMean <= 0) return matchScore;
  const penalty = Math.round(zeroPocketMean * dialogueDensity * 30 * 1e4) / 1e4;
  return Math.round(Math.max(0, matchScore - penalty) * 1e4) / 1e4;
}

// ─────────────────────────────────────────────────────────────────────────────
// DNA Cross-Correlation — joint lag sweep over the structural bands
// ─────────────────────────────────────────────────────────────────────────────

/** Weight of each DNA band in the joint lag sweep. Must sum to 1.0. */
export interface DNABandWeights {
  /** 20–80 Hz sub-bass weight — physical impact alignment */
  subZero: number;
  /** Chroma-entropy harmonic tension — psychological pressure alignment */
  cmamTension: number;
  /** 10–20 kHz transient sizzle — edit-speed alignment (all-zeros at 16 kHz SR) */
  highFidelityAir: number;
}

export const DEFAULT_DNA_WEIGHTS: DNABandWeights = {
  subZero:         0.40,
  cmamTension:     0.40,
  highFidelityAir: 0.20,
};

export interface DNAOffsetResult {
  /** Seconds the proposed track must be delayed (+) or advanced (−) against
   *  the temp track's start for maximum structural intersection. */
  dropFrameOffsetSec: number;
  /** The same offset in analysis frames (offsetSec × fps). */
  lagFrames: number;
  /** Weighted mean per-band correlation at the chosen lag, in [−1, 1]. */
  correlation: number;
  /** Per-band correlation at the chosen lag. Silent bands report 0. */
  bandCorrelations: { subZero: number; cmamTension: number; highFidelityAir: number };
  /** Bands that carried signal and participated in the sweep. */
  activeBands: Array<keyof DNABandWeights>;
}

const DNA_BANDS: ReadonlyArray<keyof DNABandWeights> =
  ["subZero", "cmamTension", "highFidelityAir"];

function assertBand(name: string, arr: unknown): asserts arr is number[] {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`DNA_ADJUDICATION: timeline band "${name}" is missing or empty`);
  }
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== "number" || !Number.isFinite(arr[i])) {
      throw new Error(
        `DNA_ADJUDICATION: timeline band "${name}" has a non-finite value at frame ${i}`,
      );
    }
  }
}

function meanOf(arr: readonly number[]): number {
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function stdOf(arr: readonly number[], m: number): number {
  let s = 0;
  for (const v of arr) s += (v - m) ** 2;
  return Math.sqrt(s / arr.length);
}

/** Z-normalise a band; returns null when the band is flat (no signal). */
function zNorm(arr: readonly number[]): number[] | null {
  const m = meanOf(arr);
  const s = stdOf(arr, m);
  if (s < 1e-9) return null;
  return arr.map(v => (v - m) / s);
}

/**
 * Find the lag (in frames) that maximises the weighted per-band correlation
 * between the temp track's DNA and the proposed track's DNA.
 *
 * The proposed arrays are slid across the temp arrays over a bounded lag range
 * (±30 % of the shorter timeline). At each lag the normalised dot product is
 * computed per band over the overlapping window and combined using
 * `weights`, renormalised over the bands that actually carry signal — the
 * High-Fidelity Air band is physically empty at the 16 kHz fast path and must
 * not dilute the sweep.
 *
 * Ties break toward the smallest (most negative) lag — deterministic.
 *
 * @param tempTimeline     Temp track forensicTimeline (the reference DNA).
 * @param proposedTimeline Proposed replacement's forensicTimeline.
 * @param fps              Analysis frame rate (25 on the fast path).
 * @param weights          Band weights; defaults to DEFAULT_DNA_WEIGHTS.
 */
export function calculateDNAOffset(
  tempTimeline:     ForensicTimeline,
  proposedTimeline: ForensicTimeline,
  fps  = 25,
  weights: DNABandWeights = DEFAULT_DNA_WEIGHTS,
): DNAOffsetResult {
  if (!tempTimeline)     throw new Error("DNA_ADJUDICATION: tempTimeline is required");
  if (!proposedTimeline) throw new Error("DNA_ADJUDICATION: proposedTimeline is required");
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`DNA_ADJUDICATION: fps must be a positive number, got ${fps}`);
  }

  for (const band of DNA_BANDS) {
    assertBand(`tempTimeline.${band}`,     tempTimeline[band]);
    assertBand(`proposedTimeline.${band}`, proposedTimeline[band]);
  }

  const n = tempTimeline.subZero.length;
  const m = proposedTimeline.subZero.length;

  // Z-normalise every band once, up front. A band is "active" only when it
  // carries signal in BOTH tracks — correlation against a flat line is
  // undefined and reported as 0.
  const tempNorm: Partial<Record<keyof DNABandWeights, number[] | null>> = {};
  const propNorm: Partial<Record<keyof DNABandWeights, number[] | null>> = {};
  for (const band of DNA_BANDS) {
    tempNorm[band] = zNorm(tempTimeline[band]);
    propNorm[band] = zNorm(proposedTimeline[band]);
  }

  const activeBands = DNA_BANDS.filter(b => tempNorm[b] !== null && propNorm[b] !== null);
  if (activeBands.length === 0) {
    // Both DNAs are flat in every band (silence vs silence): structurally
    // indistinguishable at lag 0.
    return {
      dropFrameOffsetSec: 0,
      lagFrames: 0,
      correlation: 0,
      bandCorrelations: { subZero: 0, cmamTension: 0, highFidelityAir: 0 },
      activeBands: [],
    };
  }

  const weightSum = activeBands.reduce((s, b) => s + weights[b], 0);
  if (weightSum <= 0) {
    throw new Error("DNA_ADJUDICATION: band weights for the active bands sum to zero");
  }

  const maxLag = Math.max(1, Math.floor(Math.min(n, m) * 0.30));

  let bestScore = -Infinity;
  let bestLag   = 0;
  let bestCorrs: Record<keyof DNABandWeights, number> = {
    subZero: 0, cmamTension: 0, highFidelityAir: 0,
  };

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const corrs: Record<keyof DNABandWeights, number> = {
      subZero: 0, cmamTension: 0, highFidelityAir: 0,
    };
    let weighted = 0;

    for (const band of activeBands) {
      const t = tempNorm[band] as number[];
      const p = propNorm[band] as number[];
      let sum   = 0;
      let count = 0;
      for (let i = 0; i < n; i++) {
        const j = i - lag;
        if (j >= 0 && j < m) {
          sum   += t[i] * p[j];
          count += 1;
        }
      }
      const corr = count > 0 ? Math.max(-1, Math.min(1, sum / count)) : 0;
      corrs[band] = corr;
      weighted   += corr * (weights[band] / weightSum);
    }

    if (weighted > bestScore) {
      bestScore = weighted;
      bestLag   = lag;
      bestCorrs = corrs;
    }
  }

  return {
    dropFrameOffsetSec: Math.round((bestLag / fps) * 1e4) / 1e4,
    lagFrames:          bestLag,
    correlation:        Math.round(bestScore * 1e4) / 1e4,
    bandCorrelations: {
      subZero:         Math.round(bestCorrs.subZero         * 1e4) / 1e4,
      cmamTension:     Math.round(bestCorrs.cmamTension     * 1e4) / 1e4,
      highFidelityAir: Math.round(bestCorrs.highFidelityAir * 1e4) / 1e4,
    },
    activeBands,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zero-Pocket Verification — frame-aligned dialogue-pocket violation check
// ─────────────────────────────────────────────────────────────────────────────

export interface ZeroPocketOptions {
  /** A temp frame is a "dip" (room left for dialogue) below this level. */
  dipThreshold: number;
  /** A proposed frame "fills" a dip above this level. */
  violationThreshold: number;
  /** Penalty at 100 % violation ratio. "Severe": above the 30-point scene cap. */
  maxPenalty: number;
}

export const DEFAULT_ZERO_POCKET_OPTIONS: ZeroPocketOptions = {
  dipThreshold:       0.20,
  violationThreshold: 0.60,
  maxPenalty:         40,
};

export interface ZeroPocketVerdict {
  /** Number of temp frames identified as dialogue dips. */
  dipFrameCount: number;
  /** Dips where the proposed track (at the aligned offset) is loud. */
  violatedFrameCount: number;
  /** violatedFrameCount / dipFrameCount, 0 when the temp has no dips. 4 d.p. */
  violationRatio: number;
  /** Points to subtract from the match score. 4 d.p. */
  penalty: number;
}

/**
 * Verify that the proposed track respects the temp track's dialogue pockets.
 *
 * Wherever the temp track's 300–3 000 Hz envelope dips (the editor left room
 * for dialogue), the proposed track — shifted by `lagFrames` from
 * calculateDNAOffset — must also be quiet. Every dip frame where the proposed
 * envelope exceeds `violationThreshold` counts as a violation; the penalty
 * scales linearly with the violated fraction up to `maxPenalty`.
 *
 * Proposed frames that fall outside the overlap window are skipped: absence of
 * audio cannot mask dialogue.
 */
export function verifyZeroPocket(
  tempZeroPocket:     readonly number[],
  proposedZeroPocket: readonly number[],
  lagFrames: number,
  options: ZeroPocketOptions = DEFAULT_ZERO_POCKET_OPTIONS,
): ZeroPocketVerdict {
  assertBand("tempZeroPocket",     tempZeroPocket);
  assertBand("proposedZeroPocket", proposedZeroPocket);
  if (!Number.isInteger(lagFrames)) {
    throw new Error(`DNA_ADJUDICATION: lagFrames must be an integer, got ${lagFrames}`);
  }

  let dipFrameCount      = 0;
  let violatedFrameCount = 0;

  for (let i = 0; i < tempZeroPocket.length; i++) {
    if (tempZeroPocket[i] >= options.dipThreshold) continue;
    const j = i - lagFrames;
    if (j < 0 || j >= proposedZeroPocket.length) continue;
    dipFrameCount += 1;
    if (proposedZeroPocket[j] > options.violationThreshold) violatedFrameCount += 1;
  }

  const violationRatio = dipFrameCount > 0
    ? Math.round((violatedFrameCount / dipFrameCount) * 1e4) / 1e4
    : 0;

  return {
    dipFrameCount,
    violatedFrameCount,
    violationRatio,
    penalty: Math.round(violationRatio * options.maxPenalty * 1e4) / 1e4,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composed adjudication — the full temp-vs-proposed verdict
// ─────────────────────────────────────────────────────────────────────────────

export interface DNAAdjudicationOptions {
  /** Analysis frame rate. Default 25 (fast path). */
  fps: number;
  /** DNA band weights for the lag sweep. */
  weights: DNABandWeights;
  /** Sigmoid-expand band envelopes before correlation (spec default: on). */
  sigmoidPrecondition: boolean;
  /** Zero-pocket thresholds and penalty cap. */
  zeroPocket: ZeroPocketOptions;
}

export const DEFAULT_ADJUDICATION_OPTIONS: DNAAdjudicationOptions = {
  fps: 25,
  weights: DEFAULT_DNA_WEIGHTS,
  sigmoidPrecondition: true,
  zeroPocket: DEFAULT_ZERO_POCKET_OPTIONS,
};

export interface DNAAdjudicationResult {
  /** Structural match after zero-pocket penalty, 0–100, 4 d.p. */
  matchScore: number;
  /** Match before the zero-pocket penalty, 0–100, 4 d.p. */
  rawMatchScore: number;
  /** 10-90 Rule divergence of the final matchScore, 4 d.p. */
  divergence: number;
  /** Alignment offset in seconds (see calculateDNAOffset). */
  dropFrameOffsetSec: number;
  offset: DNAOffsetResult;
  zeroPocket: ZeroPocketVerdict;
}

/**
 * Full Temp Track DNA adjudication.
 *
 *   1. (optional) sigmoid-expand every DNA band of both timelines
 *   2. joint lag sweep → dropFrameOffsetSec + per-band correlations
 *   3. rawMatchScore = (weighted correlation + 1) / 2 × 100
 *   4. frame-aligned zero-pocket verification at the chosen lag
 *   5. matchScore = rawMatchScore − zeroPocket.penalty (floored at 0)
 *   6. divergence = 10-90 Rule on the final matchScore
 *
 * Deterministic: identical inputs produce byte-identical results.
 */
export function adjudicateDNA(
  tempTimeline:     ForensicTimeline,
  proposedTimeline: ForensicTimeline,
  options: Partial<DNAAdjudicationOptions> = {},
): DNAAdjudicationResult {
  const opts: DNAAdjudicationOptions = {
    ...DEFAULT_ADJUDICATION_OPTIONS,
    ...options,
    weights:    { ...DEFAULT_DNA_WEIGHTS,          ...(options.weights    ?? {}) },
    zeroPocket: { ...DEFAULT_ZERO_POCKET_OPTIONS,  ...(options.zeroPocket ?? {}) },
  };

  if (!tempTimeline)     throw new Error("DNA_ADJUDICATION: tempTimeline is required");
  if (!proposedTimeline) throw new Error("DNA_ADJUDICATION: proposedTimeline is required");
  assertBand("tempTimeline.zeroPocketZone",     tempTimeline.zeroPocketZone);
  assertBand("proposedTimeline.zeroPocketZone", proposedTimeline.zeroPocketZone);

  const condition = (t: ForensicTimeline): ForensicTimeline =>
    opts.sigmoidPrecondition
      ? {
          subZero:         sigmoidExpandArray(t.subZero),
          zeroPocketZone:  t.zeroPocketZone,  // thresholds are calibrated on raw envelopes
          presence:        t.presence,
          highFidelityAir: sigmoidExpandArray(t.highFidelityAir),
          cmamTension:     sigmoidExpandArray(t.cmamTension),
        }
      : t;

  const temp     = condition(tempTimeline);
  const proposed = condition(proposedTimeline);

  const offset = calculateDNAOffset(temp, proposed, opts.fps, opts.weights);

  const rawMatchScore = Math.round(((offset.correlation + 1) / 2) * 100 * 1e4) / 1e4;

  const zeroPocket = verifyZeroPocket(
    tempTimeline.zeroPocketZone,
    proposedTimeline.zeroPocketZone,
    offset.lagFrames,
    opts.zeroPocket,
  );

  const matchScore = Math.round(
    Math.max(0, rawMatchScore - zeroPocket.penalty) * 1e4,
  ) / 1e4;

  return {
    matchScore,
    rawMatchScore,
    divergence: computeDivergence(matchScore),
    dropFrameOffsetSec: offset.dropFrameOffsetSec,
    offset,
    zeroPocket,
  };
}
