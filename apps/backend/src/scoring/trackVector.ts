// Canonical track scoring vector.
//
// One vector. One function. One rank.
//
// Architecture rule (non-negotiable):
//   Adjust embeddings, normalization, or risk model inputs.
//   Do NOT adjust WEIGHTS. The weight system stays stable.

import { createHash } from "crypto";
import { scoreLyricsSemantic, lyricsSemanticToAxisValue } from "./lyricsSemantic";
import type { LyricsState } from "../lib/lrclib";

// ─── Weights (stable, fixed priors) ──────────────────────────────────────────

export const WEIGHTS = {
  scene:         0.45,  // PAD scene fit (emotional-spatial alignment)
  lyrics:        0.25,  // lyricsSemantic — keyword-lexicon vocabulary overlap vs brief
  audioSignal:   0.20,  // spectral tension + intimacy fit to brief
  rightsClarity: 0.10,  // data confidence — rewards complete rights data without overriding creative ranking
  // clearanceComplexity is NOT in FitIndex — displayed independently as a separate signal
} as const;

// Sum guard — caught at import time, not at runtime.
const _sum = WEIGHTS.scene + WEIGHTS.lyrics + WEIGHTS.audioSignal + WEIGHTS.rightsClarity;
if (Math.abs(_sum - 1.0) > 1e-9) {
  throw new Error(`WEIGHTS must sum to 1.0, got ${_sum}`);
}

// ─── Canonical vector ─────────────────────────────────────────────────────────

export interface TrackVector {
  scene:         number;  // 0–1
  lyrics:        number;  // 0–1
  audioSignal:   number;  // 0–1
  rightsClarity: number;  // 0–1, data confidence (completeness of rights fields)
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
    v.scene         * WEIGHTS.scene         +
    v.lyrics        * WEIGHTS.lyrics        +
    v.audioSignal   * WEIGHTS.audioSignal   +
    v.rightsClarity * WEIGHTS.rightsClarity,
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

// ClearanceComplexity axis:
//   Measures how easy this track is to clear based on known rights data.
//   Score 0–100, higher = easier to clear. Maps to 0–1 axis value.
//
//   Scoring breakdown (max 100):
//     isOneStop = true               +40  (single rights holder)
//     masterOwnershipPct = 100       +20  (no split negotiation)
//     publisher known, indie/self    +15  (fast clearance path)
//     publisher known, major label   +5   (known but complex)
//     proAffiliation known           +10
//     writerName known               +10
//     syncLicenseStatus = "cleared"  +5   (bonus)
//
//   A one-stop indie with known publisher + PRO = 95+.
//   A major label track with no one-stop confirmation = 15 or less.

const MAJOR_LABELS = new Set([
  'sony', 'sony music', 'smg', 'sony bmg',
  'universal', 'universal music', 'umg', 'universal music group',
  'warner', 'warner music', 'wmg', 'warner music group',
  'emi', 'capitol', 'atlantic', 'columbia', 'interscope',
  'def jam', 'republic', 'rca', 'arista', 'epic', 'polydor',
  'island', 'motown', 'virgin', 'parlophone',
]);

function isMajorLabel(publisher: string): boolean {
  const lower = publisher.toLowerCase().trim();
  return Array.from(MAJOR_LABELS).some(m => lower.includes(m));
}

export interface ClearanceComplexityInputs {
  isOneStop:          boolean | null;
  masterOwnershipPct: number | null;
  publisherName:      string | null;
  proAffiliation:     string | null;
  writerName:         string | null;
  syncLicenseStatus:  string | null;
}

export function computeClearanceComplexity(inputs: ClearanceComplexityInputs): number {
  let score = 0;
  if (inputs.isOneStop === true)                               score += 40;
  if (inputs.masterOwnershipPct === 100)                       score += 20;
  if (inputs.publisherName) {
    score += isMajorLabel(inputs.publisherName) ? 8 : 15;
  }
  if (inputs.proAffiliation)                                   score += 10;
  if (inputs.writerName)                                       score += 10;
  if (inputs.syncLicenseStatus?.toLowerCase() === 'cleared')  score +=  5;
  return clamp(score, 0, 100);
}

export function buildClearanceAxis(inputs: ClearanceComplexityInputs): number {
  const score = computeClearanceComplexity(inputs);
  // Map 0→100 to 0.20→1.00 — unverified tracks start uncertain, not blocked.
  return clamp(0.20 + (score / 100) * 0.80, 0, 1);
}

// dataConfidence — keeps the old 4×25 checklist logic.
// Does NOT feed into FitIndex. Displayed in the rights panel only.
export interface DataConfidenceInputs {
  isrc:           string | null;
  ascapWorkId:    string | null;
  masterOwnershipPct: number | null;
  isOneStop:      boolean | null;
  writerName:     string | null;
  writerIpi:      string | null;
  publisherName:  string | null;
  proAffiliation: string | null;
}

export function computeDataConfidence(inputs: DataConfidenceInputs): { score: number; verifiedCount: number; totalFields: number } {
  const fields = [
    !!inputs.isrc,
    !!inputs.ascapWorkId,
    inputs.masterOwnershipPct !== null,
    inputs.isOneStop !== null,
    !!inputs.writerName,
    !!inputs.writerIpi,
    !!inputs.publisherName,
    !!inputs.proAffiliation,
  ];
  const verifiedCount = fields.filter(Boolean).length;
  const totalFields   = fields.length;
  return { score: Math.round((verifiedCount / totalFields) * 100), verifiedCount, totalFields };
}

// Lyrics axis — lyricsSemantic keyword-lexicon scoring.
//
// Measures vocabulary overlap between lyric text and the brief's thematic
// keyword set. Deterministic: same lyricsText + same briefId → same axis
// value always. No LLM, no randomness.
//
// Neutral-state contract (INSTRUMENTAL and UNAVAILABLE):
//   Both states return axisValue = 0.50, contributing exactly 0.50 × 0.20
//   = 0.10 to the total FitIndex. This is identical to the old stub value,
//   so tracks without usable lyrics are neither rewarded nor penalised by
//   this axis. Ranking among neutral-lyric tracks is determined entirely by
//   scene, rights, and audioSignal. The 0.10 flat contribution must NOT be
//   read as semantic evidence of lyric alignment — it is a "no data" anchor
//   that keeps the four-axis weight structure stable.
//
//   INSTRUMENTAL = confirmed no lyrics (track is instrumental).
//   UNAVAILABLE  = LRCLib has no record for this track.
//   null inputs  = lyrics have not been fetched yet → treated as UNAVAILABLE.
export interface LyricsSemanticInputs {
  lyricsText:  string | null;  // cached plaintext from LRCLib; null if not fetched
  lyricsState: string | null;  // "FULL" | "INSTRUMENTAL" | "UNAVAILABLE" | null
  briefId:     string;
}

export function buildLyricsAxis(inputs: LyricsSemanticInputs | null): number {
  if (inputs === null || inputs.lyricsState === null) return 0.50;

  // Validate the stored state string against the known LyricsState values.
  // An unrecognised value (e.g. DB corruption) is treated as UNAVAILABLE.
  const VALID: LyricsState[] = ["FULL", "INSTRUMENTAL", "UNAVAILABLE"];
  const state: LyricsState = VALID.includes(inputs.lyricsState as LyricsState)
    ? (inputs.lyricsState as LyricsState)
    : "UNAVAILABLE";

  const result = scoreLyricsSemantic(inputs.lyricsText, state, inputs.briefId);
  return lyricsSemanticToAxisValue(result);
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

// RightsClarity axis — data confidence as a soft scoring input.
//   Maps the dataConfidence percentage (0–100) to a 0–1 axis value.
//   Rewards complete rights data without letting it override creative ranking.
//   Falls back to 0.50 (neutral) when dataConfidence is null.
export function buildRightsClarityAxis(dataConfidenceScore: number | null): number {
  if (dataConfidenceScore === null) return 0.50;
  return clamp(dataConfidenceScore / 100, 0, 1);
}

export interface VectorInputs {
  padSceneFit:    number;
  dspMatchScore:  number;
  /** null = lyrics not yet fetched for this track → axis returns neutral 0.50 */
  lyrics:         LyricsSemanticInputs | null;
  audioSignal: {
    tensionMean:  number | null;
    intimacyMean: number | null;
    briefId:      string;
  };
  /** dataConfidence score 0–100, or null if not computed → axis returns neutral 0.50 */
  rightsClarity:  number | null;
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
    scene:         buildSceneAxis(inputs.padSceneFit, inputs.dspMatchScore),
    lyrics:        buildLyricsAxis(inputs.lyrics),
    audioSignal:   buildAudioSignalAxis(
      inputs.audioSignal.tensionMean,
      inputs.audioSignal.intimacyMean,
      inputs.audioSignal.briefId,
    ),
    rightsClarity: buildRightsClarityAxis(inputs.rightsClarity),
  };

  const score = scoreTrack(vector);

  const inputHash = createHash("sha256")
    .update(sortedJson({ inputs, WEIGHTS }))
    .digest("hex");

  return { vector, ranked: { score, vector, inputHash } };
}
