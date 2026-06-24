/**
 * arcFeatures — scalar narrative features derived from smoothed curves.
 *
 * All computations are purely numeric — no ML, no heuristics, no subjectivity.
 * All values are deterministic: same input → same output.
 *
 * SCDE field mapping (documented for integration layer):
 *   peak_time      → turn alignment constraint
 *   release_time   → delayed emotional release constraint
 *   rise_rate      → tension buildup constraint
 *   sustain_ratio  → energy persistence constraint
 *   volatility     → fragmentation constraint
 */

import type { DerivedFeatures } from './types';

// Thresholds (spec-defined)
const SECONDARY_PEAK_THRESHOLD = 0.70;
const RELEASE_THRESHOLD        = 0.30;
const SUSTAIN_THRESHOLD        = 0.60;

/** Normalized position of a frame index within [0, 1]. */
function normalizedTime(idx: number, n: number): number {
  return n <= 1 ? 0 : idx / (n - 1);
}

/** Index of the global maximum. */
function argmax(arr: number[]): number {
  let best = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[best]) best = i;
  }
  return best;
}

/**
 * Find local maxima in `arr`.
 * A local maximum at index i satisfies: arr[i] > arr[i-1] && arr[i] >= arr[i+1]
 * (strictly greater on the left side to prefer the first sample when values tie).
 */
function localMaxima(arr: number[]): number[] {
  const idxs: number[] = [];
  for (let i = 1; i < arr.length - 1; i++) {
    if (arr[i] > arr[i - 1] && arr[i] >= arr[i + 1]) idxs.push(i);
  }
  return idxs;
}

/** Mean slope between two points given their index distance. */
function meanSlope(energyA: number, energyB: number, frames: number): number {
  if (frames <= 0) return 0;
  return (energyB - energyA) / frames;
}

/**
 * Variance of a numeric array (population variance, no Bessel correction).
 * Returns 0 for arrays of length < 2 or with zero range.
 */
function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  let mean = 0;
  for (const v of arr) mean += v;
  mean /= arr.length;
  let sq = 0;
  for (const v of arr) sq += (v - mean) ** 2;
  return sq / arr.length;
}

/**
 * Derive all scalar arc features from the smoothed, normalized energy curve.
 * Time values are always normalized to [0, 1].
 */
export function extractArcFeatures(energy: number[]): DerivedFeatures {
  const n = energy.length;
  if (n === 0) {
    return {
      peak_time: 0, secondary_peaks: [], release_time: 0,
      rise_rate: 0, decay_rate: 0, sustain_ratio: 0, volatility: 0,
    };
  }

  // ── peak_time ────────────────────────────────────────────────────────────────
  const peakIdx  = argmax(energy);
  const peakTime = normalizedTime(peakIdx, n);

  // ── secondary_peaks ──────────────────────────────────────────────────────────
  const allMaxima = localMaxima(energy);
  const secondaryPeaks = allMaxima
    .filter(i => i !== peakIdx && energy[i] >= SECONDARY_PEAK_THRESHOLD)
    .map(i => normalizedTime(i, n));

  // ── release_time ─────────────────────────────────────────────────────────────
  // Last frame at or after peakIdx where energy < RELEASE_THRESHOLD.
  let releaseIdx = peakIdx;
  for (let i = peakIdx; i < n; i++) {
    if (energy[i] < RELEASE_THRESHOLD) releaseIdx = i;
  }
  const releaseTime = normalizedTime(releaseIdx, n);

  // ── rise_rate ─────────────────────────────────────────────────────────────────
  // Mean slope from frame 0 to peak. Units: Δenergy / Δframe.
  const riseRate = meanSlope(energy[0], energy[peakIdx], peakIdx);

  // ── decay_rate ────────────────────────────────────────────────────────────────
  // Mean slope from peak to last frame.
  const decayRate = meanSlope(energy[peakIdx], energy[n - 1], n - 1 - peakIdx);

  // ── sustain_ratio ─────────────────────────────────────────────────────────────
  const sustainCount = energy.filter(v => v > SUSTAIN_THRESHOLD).length;
  const sustainRatio = sustainCount / n;

  // ── volatility ────────────────────────────────────────────────────────────────
  // Variance of the first difference (frame-to-frame change) of energy.
  const diff = new Array<number>(Math.max(0, n - 1));
  for (let i = 0; i < n - 1; i++) diff[i] = energy[i + 1] - energy[i];
  const vol = variance(diff);

  return {
    peak_time:       peakTime,
    secondary_peaks: secondaryPeaks,
    release_time:    releaseTime,
    rise_rate:       riseRate,
    decay_rate:      decayRate,
    sustain_ratio:   sustainRatio,
    volatility:      vol,
  };
}
