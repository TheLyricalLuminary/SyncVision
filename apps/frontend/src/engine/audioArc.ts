/**
 * Browser-side audio arc extraction — the demo-mode counterpart of the
 * backend ANAE module (apps/backend/src/audio/anae).
 *
 * Measures the ACTUAL uploaded audio via the Web Audio API:
 *   1. Decode to PCM (AudioContext.decodeAudioData)
 *   2. Mono mixdown, overlapping frames (2048 samples, 50% hop)
 *   3. Per frame: RMS energy + zero-crossing rate (brightness proxy for
 *      spectral centroid — cheap, deterministic, no FFT needed)
 *   4. Moving-average smoothing (~2 s window)
 *   5. Min-max normalize per track
 *   6. Collapse into the 4 narrative phases (opening / held breath / turn /
 *      release) + 32-point fine curves for the Emotional Profile export
 *
 * Deterministic: identical file bytes → identical arc. No randomness.
 */

export type RealAudioArc = {
  /** Energy magnitude per phase, 0–100 (opening, heldBreath, turn, release). */
  phases: number[];
  /** Brightness-derived valence per phase, -100..100. */
  valence: number[];
  /** 32-point smoothed energy curve, 0–1 — the fine-grained DNA. */
  fineEnergy: number[];
  /** 32-point smoothed brightness curve, 0–1. */
  fineBrightness: number[];
  /** Mean normalized energy across the track, 0–1. */
  meanEnergy: number;
  durationSec: number;
};

const FRAME = 2048;
const HOP = 1024;
const FINE_POINTS = 32;

function movingAvg(src: Float64Array, win: number): Float64Array {
  const out = new Float64Array(src.length);
  let sum = 0;
  const half = Math.floor(win / 2);
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= win) sum -= src[i - win];
    // centered-ish: write the trailing average shifted back by half a window
    const at = i - half;
    if (at >= 0) out[at] = sum / Math.min(i + 1, win);
  }
  for (let i = src.length - half; i < src.length; i++) {
    if (i >= 0) out[i] = out[Math.max(0, src.length - half - 1)];
  }
  return out;
}

function minMax(src: Float64Array): Float64Array {
  let min = Infinity, max = -Infinity;
  for (const v of src) { if (v < min) min = v; if (v > max) max = v; }
  const out = new Float64Array(src.length);
  if (max - min < 1e-9) { out.fill(0.5); return out; }
  for (let i = 0; i < src.length; i++) out[i] = (src[i] - min) / (max - min);
  return out;
}

function quarterMeans(src: Float64Array): number[] {
  const n = src.length;
  if (n === 0) return [0.5, 0.5, 0.5, 0.5];
  const out: number[] = [];
  for (let q = 0; q < 4; q++) {
    const start = Math.floor((q * n) / 4);
    const end = Math.max(start + 1, Math.floor(((q + 1) * n) / 4));
    let sum = 0;
    for (let i = start; i < end; i++) sum += src[i];
    out.push(sum / (end - start));
  }
  return out;
}

function resample(src: Float64Array, points: number): number[] {
  const n = src.length;
  if (n === 0) return new Array<number>(points).fill(0.5);
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const pos = (i / (points - 1)) * (n - 1);
    const lo = Math.floor(pos), hi = Math.min(n - 1, lo + 1);
    const frac = pos - lo;
    out.push(Number((src[lo] * (1 - frac) + src[hi] * frac).toFixed(4)));
  }
  return out;
}

/**
 * Extract a real arc from an audio object URL (from audioStore).
 * Returns null when the URL is missing or the browser can't decode the codec —
 * callers fall back to the modeled arc so the flow never breaks.
 */
export async function extractAudioArc(objectUrl: string | null): Promise<RealAudioArc | null> {
  if (!objectUrl) return null;
  let ctx: AudioContext | null = null;
  try {
    const buf = await (await fetch(objectUrl)).arrayBuffer();
    const AC: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    const audio = await ctx.decodeAudioData(buf);

    const n = audio.length;
    const chs = audio.numberOfChannels;
    let mono: Float32Array;
    if (chs === 1) {
      mono = audio.getChannelData(0);
    } else {
      mono = new Float32Array(n);
      for (let c = 0; c < chs; c++) {
        const d = audio.getChannelData(c);
        for (let i = 0; i < n; i++) mono[i] += d[i] / chs;
      }
    }

    const nFrames = Math.max(1, Math.floor((n - FRAME) / HOP) + 1);
    const energy = new Float64Array(nFrames);
    const zcr = new Float64Array(nFrames);
    for (let f = 0; f < nFrames; f++) {
      const off = f * HOP;
      let sum = 0, crossings = 0;
      let prev = mono[off];
      for (let i = 0; i < FRAME && off + i < n; i++) {
        const s = mono[off + i];
        sum += s * s;
        if ((s >= 0) !== (prev >= 0)) crossings++;
        prev = s;
      }
      energy[f] = Math.sqrt(sum / FRAME);
      zcr[f] = crossings / FRAME;
    }

    const win = Math.max(1, Math.round((2 * audio.sampleRate) / HOP)); // ~2 s
    const nE = minMax(movingAvg(energy, win));
    const nB = minMax(movingAvg(zcr, win));

    const phaseEnergy = quarterMeans(nE);
    const phaseBright = quarterMeans(nB);

    let meanEnergy = 0;
    for (const v of nE) meanEnergy += v;
    meanEnergy /= nE.length;

    return {
      phases: phaseEnergy.map(v => Math.round(5 + v * 90)),
      valence: phaseBright.map(v => Math.round((v * 2 - 1) * 100)),
      fineEnergy: resample(nE, FINE_POINTS),
      fineBrightness: resample(nB, FINE_POINTS),
      meanEnergy,
      durationSec: audio.duration,
    };
  } catch {
    return null; // undecodable codec, truncated file, etc. — caller falls back
  } finally {
    if (ctx) void ctx.close().catch(() => undefined);
  }
}
