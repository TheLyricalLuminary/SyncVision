/**
 * extractTrackArc — main ANAE entry point.
 *
 * Pipeline:
 *   1. Decode audio to mono float32 PCM via ffmpeg
 *   2. Segment into overlapping frames
 *   3. Extract RMS energy, spectral flux, spectral centroid per frame
 *   4. Normalize each curve independently to [0, 1]
 *   5. Smooth curves (moving average or Savitzky-Golay)
 *   6. Derive scalar arc features from smoothed energy curve
 *   7. Return TrackArc
 *
 * The function is deterministic: identical audioBuffer → identical TrackArc.
 * No ML, no embeddings, no randomness at any stage.
 */

import { spawn } from 'child_process';
import type { AnaeConfig, RawFrameFeatures, TrackArc } from './types';
import { ANAE_DEFAULTS } from './types';
import { extractFrameFeatures } from './featureFrames';
import { normalizeCurves } from './normalization';
import { smoothCurves } from './smoothing';
import { extractArcFeatures } from './arcFeatures';

// ── Audio decoding ─────────────────────────────────────────────────────────────

/**
 * Decode any audio format to mono float32 PCM at `targetSampleRate` Hz
 * by piping through ffmpeg.
 *
 * Requires ffmpeg to be available on PATH (always true in the Render/Docker env).
 */
function decodeAudio(audioBuffer: Buffer, targetSampleRate: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const proc = spawn('ffmpeg', [
      '-loglevel', 'error',
      '-i',        'pipe:0',     // read from stdin
      '-f',        'f32le',      // output: 32-bit float little-endian
      '-ac',       '1',          // mono
      '-ar',       String(targetSampleRate),
      'pipe:1',                  // write to stdout
    ]);

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    const stderrChunks: Buffer[] = [];
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    proc.on('error', (err: Error) => {
      reject(new Error(`ANAE: ffmpeg spawn error — ${err.message}. Is ffmpeg installed?`));
    });

    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        const msg = Buffer.concat(stderrChunks).toString('utf8').slice(0, 300);
        reject(new Error(`ANAE: ffmpeg exited with code ${code}: ${msg}`));
        return;
      }

      const combined = Buffer.concat(chunks);
      if (combined.length === 0) {
        reject(new Error('ANAE: ffmpeg produced no PCM output (empty or corrupt audio?)'));
        return;
      }

      // Read float32 LE samples safely via DataView to avoid alignment issues.
      const nSamples = Math.floor(combined.length / 4);
      const samples  = new Float32Array(nSamples);
      const view     = new DataView(combined.buffer, combined.byteOffset, combined.byteLength);
      for (let i = 0; i < nSamples; i++) {
        samples[i] = view.getFloat32(i * 4, /* littleEndian */ true);
      }
      resolve(samples);
    });

    proc.stdin.end(audioBuffer);
  });
}

// ── Pure computation core ──────────────────────────────────────────────────────

/**
 * Compute a TrackArc from pre-decoded PCM samples.
 *
 * This function is pure and synchronous. Given identical inputs it always
 * produces identical outputs.
 *
 * @param samples    - Mono float32 PCM waveform.
 * @param sampleRate - Sample rate of `samples` in Hz.
 * @param trackId    - Opaque identifier copied into the output.
 * @param config     - Optional overrides; defaults are applied for any omitted fields.
 */
export function computeTrackArc(
  samples: Float32Array,
  sampleRate: number,
  trackId: string,
  config?: AnaeConfig,
): TrackArc {
  const frameSize            = config?.frame_size              ?? ANAE_DEFAULTS.frame_size;
  const hopSize              = config?.hop_size                ?? ANAE_DEFAULTS.hop_size;
  const smoothingWindowSecs  = config?.smoothing_window_seconds ?? ANAE_DEFAULTS.smoothing_window_seconds;
  const smoothingMethod      = config?.smoothing_method         ?? ANAE_DEFAULTS.smoothing_method;

  // Step 2–3: frame segmentation + feature extraction
  const raw: RawFrameFeatures = extractFrameFeatures(samples, frameSize, hopSize, sampleRate);

  // Step 4: normalize each curve independently to [0, 1]
  const normalized = normalizeCurves(raw);

  // Step 5: smooth — window in seconds → window in frames
  const frameRate     = raw.frame_rate;
  const windowFrames  = Math.max(1, Math.round(smoothingWindowSecs * frameRate));
  const smoothed      = smoothCurves(normalized, smoothingMethod, windowFrames);

  // Step 6: arc feature extraction from smoothed energy curve
  const derived = extractArcFeatures(smoothed.energy);

  return {
    track_id:         trackId,
    duration_seconds: raw.duration_seconds,
    curves: {
      energy:     smoothed.energy,
      motion:     smoothed.motion,
      brightness: smoothed.brightness,
    },
    derived_features: derived,
    metadata: {
      frame_rate:           frameRate,
      smoothing_method:     smoothingMethod,
      normalization_method: 'min-max per-track',
      version:              '1.0.0',
    },
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * End-to-end ANAE pipeline.
 *
 * Decodes `audioBuffer` (any format ffmpeg understands: MP3, WAV, FLAC, AIFF…)
 * and returns a deterministic TrackArc.
 *
 * Identical buffers always produce identical output across repeated calls.
 *
 * @param audioBuffer - Raw audio file bytes.
 * @param trackId     - Identifier for this track (copied into TrackArc).
 * @param config      - Optional pipeline overrides.
 */
export async function extractTrackArc(
  audioBuffer: Buffer,
  trackId: string,
  config?: AnaeConfig,
): Promise<TrackArc> {
  const targetSampleRate = config?.sample_rate ?? ANAE_DEFAULTS.sample_rate;

  // Step 1: decode to mono PCM
  const samples = await decodeAudio(audioBuffer, targetSampleRate);

  return computeTrackArc(samples, targetSampleRate, trackId, config);
}
