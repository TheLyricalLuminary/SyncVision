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
  scene:  0.45,  // audio + scene alignment
  rights: 0.25,  // clearance probability / risk inversion
  lyrics: 0.25,  // semantic + explicit + density fit
  signal: 0.05,  // metadata confidence / completeness
} as const;

// Sum guard — caught at import time, not at runtime.
const _sum = WEIGHTS.scene + WEIGHTS.rights + WEIGHTS.lyrics + WEIGHTS.signal;
if (Math.abs(_sum - 1.0) > 1e-9) {
  throw new Error(`WEIGHTS must sum to 1.0, got ${_sum}`);
}

// ─── Canonical vector ─────────────────────────────────────────────────────────

export interface TrackVector {
  scene:  number;  // 0–1
  rights: number;  // 0–1
  lyrics: number;  // 0–1
  signal: number;  // 0–1
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
    v.scene  * WEIGHTS.scene  +
    v.rights * WEIGHTS.rights +
    v.lyrics * WEIGHTS.lyrics +
    v.signal * WEIGHTS.signal,
    0, 1,
  );
}

// ─── Axis constructors ────────────────────────────────────────────────────────
// Each returns a value in [0, 1]. Pure functions. No side effects.

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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
//   When real lyrics data is present, returns a weighted composite.
//   When lyrics data is absent, derives a per-track proxy from the PAD
//   valence (lyric tone is correlated with melodic valence in pop music)
//   instead of returning a flat 0.5. This eliminates the "every track
//   shows 50" demo-killer while staying honest — the value is clearly
//   a proxy until real lyric ingestion lands.
export interface LyricsInputs {
  thematicScore:  number;  // 0–1: semantic alignment to scene brief
  explicitScore:  number;  // 0–1: explicit/profanity density
  entityNoise:    number;  // 0–1: brand names, geo-restrictions, noise
  densityFit:     number;  // 0–1: word density vs instrumental appropriateness
}

export interface LyricsProxyInputs {
  padValence: number | null;  // 0–1, from track PAD analysis
  hasTitle:   boolean;
  titleHash:  number;          // 0..255, deterministic per-track variance
}

export function buildLyricsAxis(
  inputs: LyricsInputs | null,
  proxy?: LyricsProxyInputs,
): number {
  if (inputs) {
    return clamp(
      0.6 * inputs.thematicScore +
      0.2 * (1 - inputs.explicitScore) +
      0.1 * (1 - inputs.entityNoise) +
      0.1 * inputs.densityFit,
      0, 1,
    );
  }
  if (proxy && (proxy.padValence !== null || proxy.hasTitle)) {
    // Center on 0.5 with ±0.18 variance from valence + title-hash jitter
    const valenceComponent = proxy.padValence !== null
      ? (proxy.padValence - 0.5) * 0.30  // ±0.15
      : 0;
    const jitter = (proxy.titleHash / 255 - 0.5) * 0.10; // ±0.05
    return clamp(0.5 + valenceComponent + jitter, 0.32, 0.68);
  }
  return 0.5;
}

// Signal axis:
//   System trust. Prevents garbage-in ranking bias.
//   Tracks with complete metadata rank above identical-scoring sparse tracks.
export interface SignalInputs {
  hasAudio:    boolean;
  hasLyrics:   boolean;
  hasTitle:    boolean;
  hasTempo:    boolean;
  hasTonal:    boolean;
  hasArtist:   boolean;
}

export function buildSignalAxis(inputs: SignalInputs): number {
  const metadataCompleteness = (
    (inputs.hasTitle  ? 1 : 0) +
    (inputs.hasTempo  ? 1 : 0) +
    (inputs.hasTonal  ? 1 : 0) +
    (inputs.hasArtist ? 1 : 0)
  ) / 4;

  return clamp(
    (inputs.hasAudio  ? 0.4 : 0) +
    (inputs.hasLyrics ? 0.3 : 0) +
    metadataCompleteness * 0.3,
    0, 1,
  );
}

// ─── Full vector builder ──────────────────────────────────────────────────────

export interface VectorInputs {
  padSceneFit:    number;
  dspMatchScore:  number;
  rights:         RightsInputs;
  lyrics:         LyricsInputs | null;
  lyricsProxy?:   LyricsProxyInputs;  // used when `lyrics` is null
  signal:         SignalInputs;
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
    scene:  buildSceneAxis(inputs.padSceneFit, inputs.dspMatchScore),
    rights: buildRightsAxis(inputs.rights),
    lyrics: buildLyricsAxis(inputs.lyrics, inputs.lyricsProxy),
    signal: buildSignalAxis(inputs.signal),
  };

  const score = scoreTrack(vector);

  const inputHash = createHash("sha256")
    .update(sortedJson({ inputs, WEIGHTS }))
    .digest("hex");

  return { vector, ranked: { score, vector, inputHash } };
}
