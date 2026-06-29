/**
 * Phase-Locked Audio Ingestion Service  (Phase 2)
 *
 * Transcodes any audio input to a phase-locked mono WAV at the sample rate
 * that guarantees an exact integer hop length for the target video frame rate,
 * then runs analyze_v2.py to produce the forensic timeline payload.
 *
 *   targetFps=24 → 48 000 Hz  (hop = 2 000)  cinema / streaming deliverable
 *   targetFps=25 → 16 000 Hz  (hop =   640)  broadcast fast-path
 *
 * Phase-lock verification:
 *   48 000 / 24 = 2 000  ✓ exact integer, zero cumulative drift
 *   16 000 / 25 =   640  ✓ exact integer, zero cumulative drift
 *
 * The ffmpeg transcode is what makes this deterministic:
 *   -ac 1          downmix to mono by channel averaging (preserves transient energy)
 *   -ar <sr>       anti-aliased resampling (no brick-wall alias fold-back)
 *   -sample_fmt s16  16-bit PCM so STFT bins align exactly with the Nyquist budget
 *
 * The resulting temp WAV is passed straight to analyze_v2.py, which reads it
 * at its native rate and computes the forensicTimeline, CMAM tension, and
 * band-limited onsets.  The temp file is always deleted in the finally block,
 * even when the worker errors.
 */

import { execFile }   from "child_process";
import { spawn }      from "child_process";
import { promisify }  from "util";
import path           from "path";
import fs             from "fs";
import os             from "os";

const execFileAsync = promisify(execFile);

// ── Phase-locked rate table ───────────────────────────────────────────────────
// Only rates whose ratio to the FPS is an exact integer belong here.
// Adding a new FPS? Verify: sr % fps === 0 before committing.

const PHASE_LOCKED_SR: Record<24 | 25, number> = {
  24: 48_000,
  25: 16_000,
};

const PHASE_LOCKED_HOP: Record<24 | 25, number> = {
  24: 2_000,   // 48000 / 24
  25:   640,   // 16000 / 25
};

// ── Output types (mirrors analyze_v2.py's JSON schema) ───────────────────────

export interface ForensicTimeline {
  /** 20–80 Hz: sub-bass / kick-drum weight element */
  subZero: number[];
  /** 300–3 000 Hz: dialogue masking zone — used for Zero-Pocket verification */
  zeroPocketZone: number[];
  /** 3–10 kHz (Nyquist-capped to 8 kHz at 16 kHz SR): harmonic midrange */
  presence: number[];
  /** 10–20 kHz: high-hat / cymbal transients.  All-zeros at 16 kHz SR. */
  highFidelityAir: number[];
  /** CMAM chroma entropy 0–1: 0 = consonant, 1 = maximally dissonant */
  cmamTension: number[];
}

export interface MajorOnset {
  timeSec:   number;
  band:      "sub_zero" | "high_fidelity_air";
  magnitude: number;
}

export interface ForensicAnalysisResult {
  durationSeconds: number;
  fps:             number;
  sampleRate:      number;
  nFft:            number;
  hopLength:       number;
  phaseLocked:     boolean;
  mode:            "fast" | "deep";
  forensicTimeline: ForensicTimeline;
  majorOnsets:     MajorOnset[];
  inputHash:       string;
  modelVersion:    string;
}

/** Scalar summary — safe to store in the DB without a JSON column. */
export interface ForensicSummary {
  /** Mean energy in the 300–3 000 Hz dialogue zone (0–1) */
  zeroPocketMean:  number;
  /** Mean energy in the 20–80 Hz sub-bass zone (0–1) */
  subZeroMean:     number;
  /** Mean CMAM harmonic tension (0–1) */
  cmamTensionMean: number;
  hopLength:       number;
  phaseLocked:     boolean;
}

// ── Worker + ffmpeg paths ─────────────────────────────────────────────────────

const WORKER_V2  = path.resolve(__dirname, "../../../worker/analyze_v2.py");
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";

async function resolveFfmpeg(): Promise<string> {
  if (process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN;
  const candidates = [
    "/opt/homebrew/bin/ffmpeg",   // macOS Homebrew (M-series)
    "/usr/local/bin/ffmpeg",      // macOS Intel Homebrew / manual install
    "/usr/bin/ffmpeg",            // Linux system package
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "ffmpeg"; // fall back to PATH
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Transcode `audioPath` to a phase-locked mono WAV and run `analyze_v2.py`.
 *
 * Returns the full forensic analysis payload.  The caller is responsible for
 * consuming or storing the `forensicTimeline`; the temp WAV is deleted before
 * this function returns.
 *
 * @param audioPath  Absolute path to any audio format ffmpeg can read.
 * @param targetFps  Target video frame rate. Determines sample rate and hop.
 */
export async function transcodeAndAnalyze(
  audioPath: string,
  targetFps: 24 | 25,
): Promise<ForensicAnalysisResult> {
  const sr     = PHASE_LOCKED_SR[targetFps];
  const tmpWav = path.join(
    os.tmpdir(),
    `sv_phlock_${Date.now()}_${process.pid}.wav`,
  );

  try {
    const ffmpeg = await resolveFfmpeg();

    await execFileAsync(ffmpeg, [
      "-i",            audioPath,
      "-ac",           "1",          // mono downmix
      "-ar",           String(sr),   // anti-aliased resample to phase-locked rate
      "-sample_fmt",   "s16",        // 16-bit PCM
      "-y",                          // overwrite temp file
      tmpWav,
    ]);

    return await runWorkerV2(tmpWav, targetFps);
  } finally {
    try { fs.unlinkSync(tmpWav); } catch { /* temp-file deletion is best-effort */ }
  }
}

/**
 * Compute scalar summary metrics from a full forensic result.
 * Round to 4 decimal places to prevent floating-point drift in the UI.
 */
export function summarizeForensic(result: ForensicAnalysisResult): ForensicSummary {
  const mean = (arr: number[]): number => {
    if (!arr.length) return 0;
    const raw = arr.reduce((s, v) => s + v, 0) / arr.length;
    return Math.round(raw * 1e4) / 1e4;
  };

  return {
    zeroPocketMean:  mean(result.forensicTimeline.zeroPocketZone),
    subZeroMean:     mean(result.forensicTimeline.subZero),
    cmamTensionMean: mean(result.forensicTimeline.cmamTension),
    hopLength:       result.hopLength,
    phaseLocked:     result.phaseLocked,
  };
}

/** Exposed for callers that need to pre-compute hop metadata without transcoding. */
export function phaseLockedHop(targetFps: 24 | 25): { sr: number; hop: number } {
  return { sr: PHASE_LOCKED_SR[targetFps], hop: PHASE_LOCKED_HOP[targetFps] };
}

// ── Internal: Python worker spawn ────────────────────────────────────────────

function runWorkerV2(wavPath: string, fps: 24 | 25): Promise<ForensicAnalysisResult> {
  return new Promise((resolve, reject) => {
    const chunks:    Buffer[] = [];
    const errChunks: Buffer[] = [];

    const proc = spawn(PYTHON_BIN, [
      WORKER_V2,
      wavPath,
      "--fps", String(fps),
    ]);

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(
          `analyze_v2.py exited ${code}: ` +
          Buffer.concat(errChunks).toString("utf8").trim(),
        ));
        return;
      }
      try {
        resolve(
          JSON.parse(Buffer.concat(chunks).toString("utf8")) as ForensicAnalysisResult,
        );
      } catch (e) {
        reject(new Error(
          `analyze_v2.py produced invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
        ));
      }
    });

    proc.on("error", (e) =>
      reject(new Error(`analyze_v2.py spawn error: ${e.message}`)),
    );
  });
}
