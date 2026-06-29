/**
 * Mirror Match — deterministic temp-track replacement scoring.
 *
 * Compares a query ForensicTimeline against catalog fingerprints on four
 * independent dimensions, then combines them with configurable weights.
 *
 * All functions are pure (no I/O, no randomness) and produce bit-identical
 * output for identical inputs.
 */

import { createHash } from "crypto";
import type { ForensicTimeline } from "../services/processAudio";

// ── Weight configuration ───────────────────────────────────────────────────────

export interface MirrorWeights {
  /** Overall structural arc similarity (cross-correlation of combined bands) */
  structural: number;
  /** Bass + presence energy alignment at the structural offset */
  energy: number;
  /** Chroma entropy (harmonic tension) alignment at the structural offset */
  harmonic: number;
  /** Dialogue safety — inverted mean zeroPocketZone of the catalog track */
  dialogue: number;
}

export const DEFAULT_MIRROR_WEIGHTS: MirrorWeights = {
  structural: 0.40,
  energy:     0.30,
  harmonic:   0.20,
  dialogue:   0.10,
};

// ── Result types ──────────────────────────────────────────────────────────────

export interface MirrorComponents {
  /** Structural arc similarity, 0–100 */
  structural: number;
  /** Bass + presence energy alignment, 0–100 */
  energy: number;
  /** CMAM harmonic tension alignment, 0–100 */
  harmonic: number;
  /** Dialogue safety: higher = safer under VO, 0–100 */
  dialogueSafety: number;
}

export interface MirrorMatchResult {
  trackId:    string;
  trackTitle: string;
  artistName: string | null;
  /** Weighted overall score, 0–100 */
  overall: number;
  components: MirrorComponents;
  /** Optimal alignment offset in seconds (positive = catalog starts later) */
  alignmentOffsetSecs: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Deterministic explanation derived from component scores */
  explanation: string;
  /** SHA-256 prefix over (queryHash, catalogInputHash, lag, weights) */
  inputHash: string;
}

export interface CoarseEnvelope {
  subZero:        number[];  // 16 mean-per-chunk bins, [0, 1]
  zeroPocketZone: number[];
  presence:       number[];
  cmamTension:    number[];
}

export interface BandStats {
  mean: number;
  std:  number;
  p10:  number;
  p50:  number;
  p90:  number;
}

export interface MirrorFingerprintData {
  coarseEnvelope: CoarseEnvelope;
  bandStats: {
    subZero:        BandStats;
    zeroPocketZone: BandStats;
    presence:       BandStats;
    cmamTension:    BandStats;
  };
  fullTimeline:    ForensicTimeline;
  durationSeconds: number;
  frameCount:      number;
  fps:             number;
  inputHash:       string;
  modelVersion:    string;
}

export interface CandidateRecord {
  trackId:      string;
  trackTitle:   string;
  artistName:   string | null;
  fps:          number;
  inputHash:    string;
  fullTimeline: ForensicTimeline;
}

export interface CoarseCandidate {
  fingerprintId:  string;
  trackId:        string;
  trackTitle:     string;
  artistName:     string | null;
  fps:            number;
  coarseEnvelope: CoarseEnvelope;
}

// ── Primitive math ────────────────────────────────────────────────────────────

/** Arithmetic mean. Returns 0 for empty input. */
export function mean(arr: readonly number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Population standard deviation. Returns 0 for empty or constant input. */
export function stdDev(arr: readonly number[], precomputedMean?: number): number {
  if (arr.length === 0) return 0;
  const m = precomputedMean ?? mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Pearson correlation of two arrays (uses the shorter length).
 * Returns 0 when either signal is constant (std < 1e-9).
 */
export function pearsonCorrelation(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;

  const aSlice = a.length > n ? a.slice(0, n) : a;
  const bSlice = b.length > n ? b.slice(0, n) : b;

  const ma = mean(aSlice);
  const mb = mean(bSlice);
  const sa = stdDev(aSlice, ma);
  const sb = stdDev(bSlice, mb);
  if (sa < 1e-9 || sb < 1e-9) return 0;

  let cov = 0;
  for (let i = 0; i < n; i++) {
    cov += (aSlice[i] - ma) * (bSlice[i] - mb);
  }
  return Math.max(-1, Math.min(1, cov / (n * sa * sb)));
}

/**
 * Cross-correlation with bounded lag search (±30 % of the shorter signal).
 *
 * Returns the peak Pearson-normalised correlation and the frame lag at which
 * it peaks.  Positive lag = catalog signal starts `lag` frames after the
 * query signal (i.e. query is earlier in calendar time).
 *
 * Complexity: O(N × maxLag) where maxLag ≤ 0.3 × min(N, M).
 */
export function crossCorrelate(
  query:   readonly number[],
  catalog: readonly number[],
): { correlation: number; lagFrames: number } {
  const n = query.length;
  const m = catalog.length;
  if (n === 0 || m === 0) return { correlation: 0, lagFrames: 0 };

  const qm = mean(query);
  const cm = mean(catalog);
  const qs = stdDev(query, qm);
  const cs = stdDev(catalog, cm);

  // Both signals flat → perfect match at lag 0
  if (qs < 1e-9 && cs < 1e-9) return { correlation: 1, lagFrames: 0 };
  if (qs < 1e-9 || cs < 1e-9) return { correlation: 0, lagFrames: 0 };

  const qNorm = Array.from(query,   v => (v - qm) / qs);
  const cNorm = Array.from(catalog, v => (v - cm) / cs);

  const maxLag = Math.max(1, Math.floor(Math.min(n, m) * 0.30));

  let bestCorr = -Infinity;
  let bestLag  = 0;

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum   = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const j = i - lag;
      if (j >= 0 && j < m) {
        sum   += qNorm[i] * cNorm[j];
        count += 1;
      }
    }
    const corr = count > 0 ? sum / count : 0;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag  = lag;
    }
  }

  return { correlation: bestCorr, lagFrames: bestLag };
}

/**
 * Shift `arr` by `lagFrames` into a window of `targetLen` samples.
 * Positive lag slides the catalog signal rightward (starts later).
 * Out-of-bounds positions are filled with 0.
 */
export function alignedSlice(
  arr:       readonly number[],
  lagFrames: number,
  targetLen: number,
): number[] {
  const result = new Array<number>(targetLen).fill(0);
  for (let i = 0; i < targetLen; i++) {
    const j = i - lagFrames;
    if (j >= 0 && j < arr.length) result[i] = arr[j];
  }
  return result;
}

// ── Band combination for structural scoring ───────────────────────────────────

function combineEnergy(t: ForensicTimeline): number[] {
  return t.subZero.map((v, i) =>
    0.40 * v +
    0.10 * (t.zeroPocketZone[i] ?? 0) +
    0.35 * (t.presence[i]       ?? 0) +
    0.15 * (t.cmamTension[i]    ?? 0),
  );
}

// ── Component scorers ─────────────────────────────────────────────────────────

/**
 * Structural similarity: cross-correlation of the combined-energy envelope.
 * Returns [0, 100] score and the optimal lag in frames.
 */
export function scoreStructural(
  query:   ForensicTimeline,
  catalog: ForensicTimeline,
): { score: number; lagFrames: number } {
  const { correlation, lagFrames } = crossCorrelate(
    combineEnergy(query),
    combineEnergy(catalog),
  );
  const score = Math.round(Math.max(0, Math.min(100, (correlation + 1) / 2 * 100)));
  return { score, lagFrames };
}

/**
 * Energy match: Pearson correlation of subZero (bass) and presence bands
 * at the alignment offset found by scoreStructural.
 */
export function scoreEnergy(
  query:     ForensicTimeline,
  catalog:   ForensicTimeline,
  lagFrames: number,
): number {
  const n    = query.subZero.length;
  const cBass = alignedSlice(catalog.subZero,   lagFrames, n);
  const cPres = alignedSlice(catalog.presence,  lagFrames, n);
  const raw   = (pearsonCorrelation(query.subZero, cBass) +
                 pearsonCorrelation(query.presence, cPres)) / 2;
  return Math.round(Math.max(0, Math.min(100, (raw + 1) / 2 * 100)));
}

/**
 * Harmonic match: Pearson correlation of CMAM chroma entropy at the
 * alignment offset found by scoreStructural.
 */
export function scoreHarmonic(
  query:     ForensicTimeline,
  catalog:   ForensicTimeline,
  lagFrames: number,
): number {
  const n       = query.cmamTension.length;
  const cTension = alignedSlice(catalog.cmamTension, lagFrames, n);
  const corr     = pearsonCorrelation(query.cmamTension, cTension);
  return Math.round(Math.max(0, Math.min(100, (corr + 1) / 2 * 100)));
}

/**
 * Dialogue safety: inverted mean zeroPocketZone energy of the CATALOG track.
 * Lower voice-band energy = track won't mask dialogue = higher safety score.
 * Query signal is irrelevant — this measures the track's intrinsic property.
 */
export function computeDialogueSafety(catalogTimeline: ForensicTimeline): number {
  const avg = mean(catalogTimeline.zeroPocketZone);
  return Math.round(Math.max(0, Math.min(100, (1 - avg) * 100)));
}

// ── Overall score ─────────────────────────────────────────────────────────────

export function computeOverall(
  components: MirrorComponents,
  weights:    MirrorWeights,
): number {
  const raw =
    components.structural    * weights.structural +
    components.energy        * weights.energy +
    components.harmonic      * weights.harmonic +
    components.dialogueSafety * weights.dialogue;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

// ── Confidence ────────────────────────────────────────────────────────────────

export function computeConfidenceLevel(
  structuralScore: number,
): "HIGH" | "MEDIUM" | "LOW" {
  if (structuralScore >= 70) return "HIGH";
  if (structuralScore >= 45) return "MEDIUM";
  return "LOW";
}

// ── Explanation (deterministic) ───────────────────────────────────────────────

export function generateExplanation(
  components: MirrorComponents,
  weights:    MirrorWeights,
): string {
  const parts: string[] = [];

  if (components.structural >= 80) {
    parts.push("strong structural arc alignment");
  } else if (components.structural >= 60) {
    parts.push("moderate structural resemblance");
  } else {
    parts.push("weak structural similarity");
  }

  if (weights.energy > 0) {
    if (components.energy >= 80) {
      parts.push("closely matched bass and presence energy");
    } else if (components.energy >= 60) {
      parts.push("comparable dynamic energy profile");
    }
  }

  if (weights.harmonic > 0) {
    if (components.harmonic >= 80) {
      parts.push("harmonic tension closely mirrors the temp track");
    } else if (components.harmonic >= 60) {
      parts.push("similar harmonic character");
    }
  }

  if (components.dialogueSafety >= 85) {
    parts.push("excellent dialogue safety");
  } else if (components.dialogueSafety < 40) {
    parts.push("caution — elevated voice-band energy may conflict with dialogue");
  }

  const sentence = parts
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join("; ");
  return sentence + ".";
}

// ── Fingerprint helpers ───────────────────────────────────────────────────────

/** Downsample a band to `nBins` mean-per-chunk values, rounded to 5 d.p. */
export function buildCoarseEnvelope(band: readonly number[], nBins = 16): number[] {
  const n = band.length;
  if (n === 0) return new Array<number>(nBins).fill(0);
  const result: number[] = [];
  for (let i = 0; i < nBins; i++) {
    const start = Math.floor((i / nBins) * n);
    const end   = Math.floor(((i + 1) / nBins) * n);
    const slice = band.slice(start, end > start ? end : start + 1);
    const avg   = slice.reduce((s, v) => s + v, 0) / slice.length;
    result.push(Math.round(avg * 1e5) / 1e5);
  }
  return result;
}

/** Compute percentile from a pre-sorted array. */
function percentile(sorted: readonly number[], p: number): number {
  const idx = Math.max(0, Math.floor(sorted.length * p));
  return sorted[idx] ?? 0;
}

/** Build the complete MirrorFingerprintData from a ForensicTimeline. */
export function buildFingerprintData(
  timeline:        ForensicTimeline,
  durationSeconds: number,
  fps:             number,
  inputHash:       string,
  modelVersion:    string,
): MirrorFingerprintData {
  const bands = ["subZero", "zeroPocketZone", "presence", "cmamTension"] as const;

  const coarseEnvelope = {} as CoarseEnvelope;
  const bandStats      = {} as MirrorFingerprintData["bandStats"];

  for (const band of bands) {
    const arr    = timeline[band];
    const m      = mean(arr);
    const s      = stdDev(arr, m);
    const sorted = [...arr].sort((a, b) => a - b);

    coarseEnvelope[band] = buildCoarseEnvelope(arr);
    bandStats[band] = {
      mean: Math.round(m * 1e5) / 1e5,
      std:  Math.round(s * 1e5) / 1e5,
      p10:  percentile(sorted, 0.10),
      p50:  percentile(sorted, 0.50),
      p90:  percentile(sorted, 0.90),
    };
  }

  return {
    coarseEnvelope,
    bandStats,
    fullTimeline:    timeline,
    durationSeconds,
    frameCount:      timeline.subZero.length,
    fps,
    inputHash,
    modelVersion,
  };
}

// ── Pre-filter ────────────────────────────────────────────────────────────────

/**
 * Fast coarse-envelope pre-filter using Pearson correlation on 16-bin vectors.
 * Returns the top `topN` candidates sorted by descending pre-score.
 * Complexity: O(K × 16) where K = number of catalog fingerprints.
 */
export function prefilterCandidates<T extends { coarseEnvelope: CoarseEnvelope }>(
  queryCoarse:    CoarseEnvelope,
  allFingerprints: T[],
  topN = 50,
): T[] {
  const scored = allFingerprints.map(fp => {
    const subCorr  = pearsonCorrelation(queryCoarse.subZero,      fp.coarseEnvelope.subZero);
    const presCorr = pearsonCorrelation(queryCoarse.presence,     fp.coarseEnvelope.presence);
    const harmCorr = pearsonCorrelation(queryCoarse.cmamTension,  fp.coarseEnvelope.cmamTension);
    // Mirror structural weights (sub + pres + harm × coarse approximation)
    const preScore = subCorr * 0.40 + presCorr * 0.35 + harmCorr * 0.25;
    return { fp, preScore };
  });

  scored.sort((a, b) => b.preScore - a.preScore);
  return scored.slice(0, topN).map(s => s.fp);
}

// ── Full ranking ──────────────────────────────────────────────────────────────

/**
 * Score and rank a list of CandidateRecords against the query timeline.
 *
 * Pipeline per candidate:
 *   1. scoreStructural → combined-energy cross-correlation → {score, lagFrames}
 *   2. scoreEnergy     → bass + presence correlation at lagFrames
 *   3. scoreHarmonic   → CMAM correlation at lagFrames
 *   4. computeDialogueSafety → inverted zeroPocket mean
 *   5. computeOverall  → weighted sum
 *
 * Results are sorted by overall score descending.
 */
export function rankCandidates(
  queryTimeline: ForensicTimeline,
  queryInputHash: string,
  candidates:    CandidateRecord[],
  weights:       MirrorWeights = DEFAULT_MIRROR_WEIGHTS,
): MirrorMatchResult[] {
  return candidates
    .map(candidate => {
      const { score: structural, lagFrames } = scoreStructural(
        queryTimeline,
        candidate.fullTimeline,
      );
      const energy         = scoreEnergy(queryTimeline, candidate.fullTimeline, lagFrames);
      const harmonic       = scoreHarmonic(queryTimeline, candidate.fullTimeline, lagFrames);
      const dialogueSafety = computeDialogueSafety(candidate.fullTimeline);

      const components: MirrorComponents = { structural, energy, harmonic, dialogueSafety };
      const overall             = computeOverall(components, weights);
      const alignmentOffsetSecs = lagFrames / Math.max(1, candidate.fps);
      const confidence          = computeConfidenceLevel(structural);
      const explanation         = generateExplanation(components, weights);

      const inputHash = createHash("sha256")
        .update(JSON.stringify({
          q:   queryInputHash,
          c:   candidate.inputHash,
          lag: lagFrames,
          w:   weights,
        }))
        .digest("hex")
        .slice(0, 32);

      return {
        trackId:             candidate.trackId,
        trackTitle:          candidate.trackTitle,
        artistName:          candidate.artistName ?? null,
        overall,
        components,
        alignmentOffsetSecs,
        confidence,
        explanation,
        inputHash,
      };
    })
    .sort((a, b) => b.overall - a.overall);
}

/** Validate that weights sum to 1.0 within floating-point tolerance. */
export function validateWeights(w: MirrorWeights): boolean {
  const sum = w.structural + w.energy + w.harmonic + w.dialogue;
  return Math.abs(sum - 1.0) < 1e-6;
}
