/**
 * smoothing — causal-centered smoothing filters.
 *
 * Implements:
 *   - Moving average (symmetric, edge-replicated)
 *   - Savitzky-Golay degree-2 (formula-computed coefficients)
 *
 * Both filters are deterministic: identical input → identical output.
 */

import type { RawFrameFeatures } from './types';

// ── Moving average ─────────────────────────────────────────────────────────────

/**
 * Symmetric moving average with edge replication.
 * Points near the boundaries use a shorter effective window.
 */
export function movingAverage(data: number[], windowSize: number): number[] {
  if (data.length === 0) return [];
  const half = Math.floor(windowSize / 2);
  const out  = new Array<number>(data.length);
  for (let i = 0; i < data.length; i++) {
    const lo  = Math.max(0, i - half);
    const hi  = Math.min(data.length - 1, i + half);
    let sum   = 0;
    for (let j = lo; j <= hi; j++) sum += data[j];
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

// ── Savitzky-Golay (degree 2) ──────────────────────────────────────────────────

/**
 * Compute Savitzky-Golay smoothing weights for polynomial degree 2 and
 * half-window m (total window = 2m + 1).
 *
 * Formula for j in [-m, m]:
 *   h[j] = (3m(m+1) - 1 - 5j²) / ((2m-1)(2m+1)(2m+3) / 3)
 *
 * Weights sum to 1 by construction.
 */
export function savitzkyGolayCoefficients(m: number): number[] {
  if (m < 1) throw new Error('SG: half-window m must be >= 1');
  const denom = ((2 * m - 1) * (2 * m + 1) * (2 * m + 3)) / 3;
  const base  = 3 * m * (m + 1) - 1;
  const coeffs: number[] = [];
  for (let j = -m; j <= m; j++) {
    coeffs.push((base - 5 * j * j) / denom);
  }
  return coeffs;
}

/**
 * Apply Savitzky-Golay smoothing (degree 2).
 * Falls back to moving average for very small arrays (length < windowSize).
 */
export function savitzkyGolay(data: number[], m: number): number[] {
  if (data.length === 0) return [];
  const windowSize = 2 * m + 1;
  if (data.length < windowSize) {
    return movingAverage(data, Math.max(1, data.length));
  }
  const coeffs = savitzkyGolayCoefficients(m);
  const out    = new Array<number>(data.length);
  for (let i = 0; i < data.length; i++) {
    let val = 0;
    for (let j = -m; j <= m; j++) {
      // Edge replication: clamp index
      const idx = Math.max(0, Math.min(data.length - 1, i + j));
      val += coeffs[j + m] * data[idx];
    }
    out[i] = val;
  }
  return out;
}

// ── Apply to all three curves ──────────────────────────────────────────────────

/**
 * Smooth all curves in `features` using the configured method.
 * `windowFrames` is the total smoothing window in frames.
 */
export function smoothCurves(
  features: RawFrameFeatures,
  method: 'moving_average' | 'savitzky_golay',
  windowFrames: number,
): RawFrameFeatures {
  const smooth = (data: number[]): number[] => {
    if (method === 'savitzky_golay') {
      const m = Math.max(1, Math.floor(windowFrames / 2));
      return savitzkyGolay(data, m);
    }
    return movingAverage(data, Math.max(1, windowFrames));
  };

  return {
    ...features,
    energy:     smooth(features.energy),
    motion:     smooth(features.motion),
    brightness: smooth(features.brightness),
  };
}
