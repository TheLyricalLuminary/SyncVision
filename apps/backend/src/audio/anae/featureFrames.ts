/**
 * featureFrames — frame segmentation and per-frame DSP feature extraction.
 *
 * Implements:
 *   - Hann windowing
 *   - In-place radix-2 Cooley-Tukey FFT (real input → one-sided magnitude)
 *   - RMS energy
 *   - Spectral centroid (brightness proxy)
 *   - Half-wave rectified spectral flux (onset-strength / motion proxy)
 *
 * All arithmetic is deterministic given identical input samples.
 * No ML, no embeddings, no stochastic operations.
 */

import type { RawFrameFeatures } from './types';

// ── Hann window ────────────────────────────────────────────────────────────────

/** Precomputed Hann window for a given frame size. Cache for reuse. */
const windowCache = new Map<number, Float64Array>();

function getHannWindow(N: number): Float64Array {
  let w = windowCache.get(N);
  if (w) return w;
  w = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  windowCache.set(N, w);
  return w;
}

// ── Radix-2 Cooley-Tukey FFT (in-place, iterative DIF) ────────────────────────

/**
 * In-place iterative radix-2 FFT.
 * `real` and `imag` must have equal length that is a power of two.
 * Modifies both arrays in place.
 */
function fftInPlace(real: Float64Array, imag: Float64Array): void {
  const N = real.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = real[i]; real[i] = real[j]; real[j] = tmp;
      tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
    }
  }

  // Butterfly passes
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const ang = (2 * Math.PI) / len;
    const wBaseRe = Math.cos(ang);
    const wBaseIm = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let wRe = 1, wIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const uRe = real[i + j];
        const uIm = imag[i + j];
        const vRe = real[i + j + halfLen] * wRe - imag[i + j + halfLen] * wIm;
        const vIm = real[i + j + halfLen] * wIm + imag[i + j + halfLen] * wRe;
        real[i + j]           = uRe + vRe;
        imag[i + j]           = uIm + vIm;
        real[i + j + halfLen] = uRe - vRe;
        imag[i + j + halfLen] = uIm - vIm;
        const nextWRe = wRe * wBaseRe - wIm * wBaseIm;
        wIm = wRe * wBaseIm + wIm * wBaseRe;
        wRe = nextWRe;
      }
    }
  }
}

/**
 * Compute the one-sided magnitude spectrum for a real-valued frame.
 * Returns an array of length (N/2 + 1).
 */
function magnitudeSpectrum(frame: Float32Array, offset: number, frameSize: number, window: Float64Array): Float64Array {
  const real = new Float64Array(frameSize);
  const imag = new Float64Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    real[i] = (frame[offset + i] ?? 0) * window[i];
  }
  fftInPlace(real, imag);
  const half = (frameSize >> 1) + 1;
  const mag = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    mag[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
  }
  return mag;
}

// ── Per-frame features ─────────────────────────────────────────────────────────

/** RMS amplitude of windowed frame samples. */
function rmsEnergy(frame: Float32Array, offset: number, frameSize: number): number {
  let sumSq = 0;
  for (let i = 0; i < frameSize; i++) {
    const s = frame[offset + i] ?? 0;
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / frameSize);
}

/**
 * Spectral centroid in bins (0 … N/2).
 * Returns 0 if the total magnitude is zero (silence).
 */
function spectralCentroid(mag: Float64Array): number {
  let weightedSum = 0;
  let totalMag = 0;
  for (let k = 0; k < mag.length; k++) {
    weightedSum += k * mag[k];
    totalMag += mag[k];
  }
  return totalMag > 0 ? weightedSum / totalMag : 0;
}

/**
 * Half-wave rectified spectral flux: sum of positive changes in magnitude
 * between consecutive frames. Returns 0 for the first frame.
 */
function spectralFlux(currMag: Float64Array, prevMag: Float64Array | null): number {
  if (!prevMag) return 0;
  let flux = 0;
  for (let k = 0; k < currMag.length; k++) {
    const delta = currMag[k] - prevMag[k];
    if (delta > 0) flux += delta;
  }
  return flux;
}

// ── Frame segmentation + extraction ───────────────────────────────────────────

/**
 * Segment `samples` into overlapping frames and extract RMS energy,
 * spectral flux, and spectral centroid for each frame.
 *
 * @param samples  - Mono PCM float32 waveform at `sampleRate` Hz.
 * @param frameSize - Window size in samples (must be power of 2).
 * @param hopSize   - Hop size in samples (typically frameSize / 2).
 * @param sampleRate - Sample rate of `samples`.
 */
export function extractFrameFeatures(
  samples: Float32Array,
  frameSize: number,
  hopSize: number,
  sampleRate: number,
): RawFrameFeatures {
  if (samples.length === 0) {
    throw new Error('ANAE: empty audio buffer');
  }

  const window   = getHannWindow(frameSize);
  const nFrames  = Math.max(1, Math.floor((samples.length - frameSize) / hopSize) + 1);
  const frameRate = sampleRate / hopSize;
  const durationSeconds = samples.length / sampleRate;

  const energy:     number[] = new Array(nFrames);
  const motion:     number[] = new Array(nFrames);
  const brightness: number[] = new Array(nFrames);

  let prevMag: Float64Array | null = null;

  for (let fi = 0; fi < nFrames; fi++) {
    const offset = fi * hopSize;
    const mag    = magnitudeSpectrum(samples, offset, frameSize, window);

    energy[fi]     = rmsEnergy(samples, offset, frameSize);
    motion[fi]     = spectralFlux(mag, prevMag);
    brightness[fi] = spectralCentroid(mag);

    prevMag = mag;
  }

  return { energy, motion, brightness, n_frames: nFrames, frame_rate: frameRate, duration_seconds: durationSeconds };
}
