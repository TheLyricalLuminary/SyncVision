/**
 * ANAE — Audio Narrative Arc Extractor
 * Types and constants
 */

/** Three continuous time-series curves extracted from audio. */
export interface ArcCurves {
  /** RMS amplitude per frame, normalized to [0, 1]. */
  energy: number[];
  /** Spectral flux per frame (onset-strength proxy), normalized to [0, 1]. */
  motion: number[];
  /** Spectral centroid per frame, normalized to [0, 1]. */
  brightness: number[];
}

/** Scalar arc features derived from the smoothed energy curve. */
export interface DerivedFeatures {
  /** Normalized position of the energy peak (0 = start, 1 = end). */
  peak_time: number;
  /** Normalized positions of secondary energy peaks above threshold. */
  secondary_peaks: number[];
  /** Last normalized position where energy drops below 0.3 after peak. */
  release_time: number;
  /** Mean slope from start to peak (energy units per normalized time). */
  rise_rate: number;
  /** Mean slope from peak to end (energy units per normalized time). */
  decay_rate: number;
  /** Fraction of frames where smoothed energy > 0.6. */
  sustain_ratio: number;
  /** Variance of the first-difference of the smoothed energy curve. */
  volatility: number;
}

export interface ArcMetadata {
  /** Frames per second (sample_rate / hop_size). */
  frame_rate: number;
  smoothing_method: string;
  normalization_method: string;
  version: '1.0.0';
}

/** The canonical ANAE output for one track. */
export interface TrackArc {
  track_id: string;
  duration_seconds: number;
  curves: ArcCurves;
  derived_features: DerivedFeatures;
  metadata: ArcMetadata;
}

/** Per-frame raw features before normalization or smoothing. */
export interface RawFrameFeatures {
  energy: number[];
  motion: number[];
  brightness: number[];
  n_frames: number;
  frame_rate: number;
  duration_seconds: number;
}

/** User-supplied configuration overrides for the ANAE pipeline. */
export interface AnaeConfig {
  /** Target sample rate after decoding. Default: 22 050 Hz. */
  sample_rate?: number;
  /**
   * FFT frame size in samples — must be a power of two.
   * Default: 4 096 (≈ 185 ms at 22 050 Hz).
   */
  frame_size?: number;
  /**
   * Hop between frames in samples.
   * Default: frame_size / 2 (50 % overlap).
   */
  hop_size?: number;
  /** Smoothing window length in seconds. Default: 3 s. */
  smoothing_window_seconds?: number;
  /** Smoothing algorithm. Default: 'moving_average'. */
  smoothing_method?: 'moving_average' | 'savitzky_golay';
}

export const ANAE_DEFAULTS = {
  sample_rate:               22050,
  frame_size:                4096,
  hop_size:                  2048,
  smoothing_window_seconds:  3,
  smoothing_method:          'moving_average' as const,
} satisfies Required<AnaeConfig>;
