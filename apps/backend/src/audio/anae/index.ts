/**
 * AUDIO_NARRATIVE_ARC_EXTRACTOR (ANAE) — public API.
 *
 * Exposes the full pipeline entry point and the pure compute core separately
 * so callers can bypass audio decoding when PCM samples are already available.
 */

export { extractTrackArc, computeTrackArc } from './extractTrackArc';
export { extractFrameFeatures } from './featureFrames';
export { normalizeCurves, minMaxNormalize } from './normalization';
export { smoothCurves, movingAverage, savitzkyGolay, savitzkyGolayCoefficients } from './smoothing';
export { extractArcFeatures } from './arcFeatures';
export type { TrackArc, ArcCurves, DerivedFeatures, ArcMetadata, AnaeConfig, RawFrameFeatures } from './types';
export { ANAE_DEFAULTS } from './types';
