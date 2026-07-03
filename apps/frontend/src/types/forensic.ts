/**
 * Forensic data contracts — mirrors the backend's shapes exactly.
 *
 *   ForensicTimeline      ← apps/backend/src/services/processAudio.ts
 *   MajorOnset            ← apps/backend/src/services/processAudio.ts
 *   AdjudicationVerdict   ← apps/backend/src/scoring/dnaAdjudication.ts
 *                           (DNAAdjudicationResult)
 *
 * Keep these in lock-step with the backend: the PresentationView renders the
 * raw arrays as-is, so a shape drift here silently corrupts the physics lanes.
 */

export interface ForensicTimeline {
  /** 20–80 Hz: sub-bass / kick-drum weight, min-max normalised [0,1] */
  subZero: number[];
  /** 300–3 000 Hz: dialogue masking zone */
  zeroPocketZone: number[];
  /** 3–10 kHz: harmonic midrange */
  presence: number[];
  /** 10–20 kHz: transient sizzle. All-zeros on the 16 kHz fast path. */
  highFidelityAir: number[];
  /** CMAM chroma entropy 0–1: 0 = consonant, 1 = maximally dissonant */
  cmamTension: number[];
}

export interface MajorOnset {
  timeSec: number;
  band: 'sub_zero' | 'high_fidelity_air';
  magnitude: number;
}

export interface ZeroPocketVerdict {
  dipFrameCount: number;
  violatedFrameCount: number;
  violationRatio: number;
  penalty: number;
}

export interface DNAOffsetSummary {
  dropFrameOffsetSec: number;
  lagFrames: number;
  correlation: number;
  bandCorrelations: {
    subZero: number;
    cmamTension: number;
    highFidelityAir: number;
  };
}

export interface AdjudicationVerdict {
  /** Structural match after zero-pocket penalty, 0–100, 4 d.p. */
  matchScore: number;
  rawMatchScore: number;
  /** 10-90 Rule divergence, 4 d.p. */
  divergence: number;
  dropFrameOffsetSec: number;
  offset: DNAOffsetSummary;
  zeroPocket: ZeroPocketVerdict;
}

export interface MirrorCandidate {
  title: string;
  artist: string;
  clearanceCostUsd: number;
  matchScore: number;
  note: string;
}

/** Everything the PresentationView needs for one adjudicated pitch. */
export interface PresentationPayload {
  /** Scene identity — e.g. "SC 14 · THE PARKING LOT" */
  sceneLabel: string;
  /** Director's cut points, seconds from scene start */
  cutPointsSec: number[];
  durationSeconds: number;
  fps: number;

  temp: {
    label: string;           // e.g. "TEMP_REF_A"
    description: string;     // e.g. "undisclosed major-label master"
    estCostUsd: number | null;
    clearable: false;
    timeline: ForensicTimeline;
  };
  proposed: {
    title: string;
    artist: string;
    clearanceCostUsd: number;
    oneStopCleared: boolean;
    timeline: ForensicTimeline;
    majorOnsets: MajorOnset[];
  };

  verdict: AdjudicationVerdict;

  /** The kinetic punctuation event the pitch hangs on (e.g. the door slam). */
  keyTransient: { label: string; timeSec: number };

  dealCloser: {
    quote: string;
    supportLine: string;
  };

  runnersUp: MirrorCandidate[];

  /** SHA-256 audit hash of the adjudication inputs */
  inputHash: string;
  modelVersion: string;

  /** True when rendering the deterministic demo fixture, not live data. */
  isFixture: boolean;
}
