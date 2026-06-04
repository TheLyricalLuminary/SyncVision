// Canonical track scoring vector.
//
// One vector. One function. One rank.
//
// Architecture rule (non-negotiable):
//   Adjust embeddings, normalization, or risk model inputs.
//   Do NOT adjust WEIGHTS. The weight system stays stable.

import { createHash } from "crypto";

// ─── Weights (stable, fixed priors) ──────────────────────────────────────────

export const WEIGHTS = {
  scene:       0.40,  // PAD scene fit (emotional-spatial alignment)
  rights:      0.25,  // clearance data completeness / risk inversion
  lyrics:      0.20,  // LYRICS_AXIS_STUB — real implementation pending Genius NLP integration
  audioSignal: 0.15,  // spectral tension + intimacy fit to brief (replaces old metadata signal)
} as const;

// Sum guard — caught at import time, not at runtime.
const _sum = WEIGHTS.scene + WEIGHTS.rights + WEIGHTS.lyrics + WEIGHTS.audioSignal;
if (Math.abs(_sum - 1.0) > 1e-9) {
  throw new Error(`WEIGHTS must sum to 1.0, got ${_sum}`);
}

// ─── Canonical vector ─────────────────────────────────────────────────────────

export interface TrackVector {
  scene:       number;  // 0–1
  rights:      number;  // 0–1
  lyrics:      number;  // 0–1
  audioSignal: number;  // 0–1
}

export interface RankedTrack {
  trackId: string;
  score:   number;       // 0–1, deterministic dot product
  vector:  TrackVector;
  inputHash: string;     // SHA-256 of canonical inputs — enables post-hoc audit
}

// ─── Scoring function ─────────────────────────────────────────────────────────

export function scoreTrack(v: TrackVector): number {
  return clamp(
    v.scene       * WEIGHTS.scene       +
    v.rights      * WEIGHTS.rights      +
    v.lyrics      * WEIGHTS.lyrics      +
    v.audioSignal * WEIGHTS.audioSignal,
    0, 1,
  );
}

// ─── Axis constructors ────────────────────────────────────────────────────────
// Each returns a value in [0, 1]. Pure functions. No side effects.

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function distFromRange(value: number, lo: number, hi: number): number {
  if (value < lo) return lo - value;
  if (value > hi) return value - hi;
  return 0;
}

// Scene axis:
//   0.7 × PAD scene fit (emotional-spatial alignment)
//   0.3 × DSP energy/spectral match
//
// Both inputs expected in [0, 100]. Normalized to [0, 1] internally.
export function buildSceneAxis(
  padSceneFit: number,    // 0–100
  dspMatchScore: number,  // 0–100
): number {
  return clamp(
    0.7 * (padSceneFit / 100) +
    0.3 * (dspMatchScore / 100),
    0, 1,
  );
}

// Rights axis:
//   Clearance score 0–100 maps to a base contribution of 0.30–1.00.
//   The 0.30 floor ensures "no rights data entered yet" reads as
//   uncertain (~0.30), not blocked (0). Absence ≠ confirmed risk.
//   Each resolved blocker moves the axis upward toward 1.0.
//   Small residual penalties for missing ISRC / unverified identity
//   are intentionally kept minor — they flag open questions, not problems.
export interface RightsInputs {
  clearanceScore: number;       // 0–100 from computeClearance()
  hasIsrc: boolean;             // ISRC present and non-synthetic
  acoustidScore: number | null; // 0–1 match confidence, null = not checked
}

export function buildRightsAxis(inputs: RightsInputs): number {
  // Map clearance 0→100 to 0.30→1.00 so unverified tracks start in
  // "uncertain" territory rather than bottoming out at 0.
  const clearanceContrib = 0.30 + clamp(inputs.clearanceScore / 100, 0, 1) * 0.70;

  // Residual uncertainty — small by design.
  const metadataUncertainty = inputs.hasIsrc ? 0 : 0.04;
  const identityUncertainty =
    inputs.acoustidScore === null ? 0.02 :  // not yet checked — tiny residual
    inputs.acoustidScore >= 0.9  ? 0 :      // confirmed match
    inputs.acoustidScore >= 0.7  ? 0.02 :   // probable match
                                    0.05;   // weak / no match

  return clamp(
    clearanceContrib - metadataUncertainty - identityUncertainty,
    0, 1,
  );
}

// Lyrics axis:
//   LYRICS_AXIS_STUB — real implementation pending Genius NLP integration.
//   Returns a fixed neutral 0.50 for all tracks. The proxy that derived
//   a value from PAD valence + title hash has been removed because it
//   was correlated with the scene axis and carried no independent signal.
//   No PASS/MAYBE narrative phrase references lyric content while this
//   axis is a stub.
export interface LyricsInputs {
  thematicScore:  number;  // 0–1: semantic alignment to scene brief
  explicitScore:  number;  // 0–1: explicit/profanity density
  entityNoise:    number;  // 0–1: brand names, geo-restrictions, noise
  densityFit:     number;  // 0–1: word density vs instrumental appropriateness
}

export function buildLyricsAxis(
  _inputs: LyricsInputs | null,
  _proxy?: unknown,
): number {
  // LYRICS_AXIS_STUB — returns neutral 0.50 until NLP integration lands.
  return 0.50;
}

// AudioSignal axis:
//   Measures how well the track's spectral character fits the brief's
//   mix profile using two dimensions:
//     tension  = spectral contrast mean (assertiveness of the spectral
//                envelope; high = cutting, crunchy; low = smooth, glassy)
//     intimacy = 1 − spectral bandwidth mean (narrowness of spectral
//                spread; high = focused, close-mic; low = wide, diffuse)
//
//   Target ranges per brief define the "ideal zone" in [tension, intimacy]
//   space. Score = inverse Euclidean distance from track to that zone,
//   normalised by sqrt(2) (the diagonal of the unit 2D square), scaled 0–100.
//
//   Falls back to 0.50 (neutral) when tensionMean or intimacyMean is null.

type Range = [number, number];

interface AudioSignalTarget {
  tension:  Range;
  intimacy: Range;
}

// Brief targets in [tension, intimacy] space. Both dimensions are 0–1.
// Tension: spectral contrast mean. High = assertive/cutting; low = smooth.
// Intimacy: 1 − spectral bandwidth mean. High = focused; low = wide/diffuse.
const AUDIO_SIGNAL_TARGETS: Record<string, AudioSignalTarget> = {
  "chase-tension":            { tension: [0.72, 1.00], intimacy: [0.00, 0.45] },
  "action-combat":            { tension: [0.75, 1.00], intimacy: [0.00, 0.40] },
  "triumph-victory":          { tension: [0.55, 0.85], intimacy: [0.20, 0.55] },
  "euphoria-celebration":     { tension: [0.50, 0.80], intimacy: [0.25, 0.60] },
  "suspense-dread":           { tension: [0.40, 0.70], intimacy: [0.40, 0.75] },
  "horror-psychological":     { tension: [0.30, 0.65], intimacy: [0.45, 0.80] },
  "drama-confrontation":      { tension: [0.50, 0.80], intimacy: [0.30, 0.65] },
  "urban-gritty":             { tension: [0.60, 0.90], intimacy: [0.15, 0.50] },
  "romance-intimacy":         { tension: [0.10, 0.45], intimacy: [0.55, 1.00] },
  "heartbreak-separation":    { tension: [0.20, 0.55], intimacy: [0.55, 0.90] },
  "grief-loss":               { tension: [0.20, 0.55], intimacy: [0.55, 1.00] },
  "contemplative-reflective": { tension: [0.25, 0.60], intimacy: [0.45, 0.80] },
  "emotional-resolution":     { tension: [0.35, 0.65], intimacy: [0.40, 0.75] },
  "comedy-light":             { tension: [0.45, 0.75], intimacy: [0.30, 0.65] },
  "quirky-offbeat":           { tension: [0.40, 0.75], intimacy: [0.30, 0.65] },
  "montage-transition":       { tension: [0.35, 0.70], intimacy: [0.30, 0.65] },
  "opening-closing-title":    { tension: [0.45, 0.75], intimacy: [0.30, 0.65] },
  "cinematic-epic":           { tension: [0.55, 0.85], intimacy: [0.20, 0.55] },
  "corporate-aspirational":   { tension: [0.40, 0.70], intimacy: [0.30, 0.65] },
  "nature-pastoral":          { tension: [0.10, 0.45], intimacy: [0.55, 0.90] },
};

const MAX_AUDIO_SIGNAL_DIST = Math.SQRT2; // diagonal of the unit 2D square

export function buildAudioSignalAxis(
  tensionMean:  number | null,
  intimacyMean: number | null,
  briefId: string,
): number {
  if (tensionMean === null || intimacyMean === null) return 0.50;
  const target = AUDIO_SIGNAL_TARGETS[briefId];
  if (!target) return 0.50;

  const dT = distFromRange(tensionMean,  target.tension[0],  target.tension[1]);
  const dI = distFromRange(intimacyMean, target.intimacy[0], target.intimacy[1]);
  const dist = Math.sqrt(dT * dT + dI * dI);
  return clamp((1 - dist / MAX_AUDIO_SIGNAL_DIST), 0, 1);
}

// ─── Full vector builder ──────────────────────────────────────────────────────

export interface VectorInputs {
  padSceneFit:    number;
  dspMatchScore:  number;
  rights:         RightsInputs;
  lyrics:         LyricsInputs | null;
  audioSignal: {
    tensionMean:  number | null;
    intimacyMean: number | null;
    briefId:      string;
  };
}

function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

export function buildVector(inputs: VectorInputs): {
  vector: TrackVector;
  ranked: Omit<RankedTrack, "trackId">;
} {
  const vector: TrackVector = {
    scene:       buildSceneAxis(inputs.padSceneFit, inputs.dspMatchScore),
    rights:      buildRightsAxis(inputs.rights),
    lyrics:      buildLyricsAxis(inputs.lyrics),
    audioSignal: buildAudioSignalAxis(
      inputs.audioSignal.tensionMean,
      inputs.audioSignal.intimacyMean,
      inputs.audioSignal.briefId,
    ),
  };

  const score = scoreTrack(vector);

  const inputHash = createHash("sha256")
    .update(sortedJson({ inputs, WEIGHTS }))
    .digest("hex");

  return { vector, ranked: { score, vector, inputHash } };
}
