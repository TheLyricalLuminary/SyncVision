/**
 * normalization — per-track min-max scaling.
 *
 * Each curve is scaled independently to [0, 1].
 * Scaling is per-track only — never against a global dataset.
 * Constant signals (min == max) map to 0.5 uniformly.
 */

import type { RawFrameFeatures } from './types';

/** Scale an array to [0, 1] using per-array min and max. */
export function minMaxNormalize(data: number[]): number[] {
  if (data.length === 0) return [];
  let min = data[0];
  let max = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  const range = max - min;
  if (range === 0) {
    return new Array(data.length).fill(0.5);
  }
  return data.map(v => (v - min) / range);
}

/**
 * Normalize each curve in `features` to [0, 1] independently.
 * Returns a new object; does not mutate input.
 */
export function normalizeCurves(features: RawFrameFeatures): RawFrameFeatures {
  return {
    ...features,
    energy:     minMaxNormalize(features.energy),
    motion:     minMaxNormalize(features.motion),
    brightness: minMaxNormalize(features.brightness),
  };
}
