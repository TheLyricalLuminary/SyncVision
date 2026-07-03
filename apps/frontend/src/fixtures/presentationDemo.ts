/**
 * Deterministic demo fixture for the PresentationView.
 *
 * Every array is generated from closed-form math (sines, pulses, decay
 * envelopes) — no randomness — so the fixture renders byte-identically on
 * every load, matching the terminal's determinism guarantee.
 *
 * Replace with live data once the mirror-search → presentation wiring lands:
 * the payload shape is identical to what POST /api/mirror/search plus the DNA
 * adjudication endpoint will return. The view shows a DEMO FIXTURE tag while
 * `isFixture` is true, so a live pitch can never silently run on canned data.
 *
 * All artists and titles are fictional. Deep-mode analysis (48 kHz) is
 * simulated so the High-Fidelity Air lane carries signal.
 */

import type {
  ForensicTimeline,
  MajorOnset,
  PresentationPayload,
} from '../types/forensic';

const FPS = 25;
const DURATION_SEC = 52;
const N = FPS * DURATION_SEC; // 1300 frames

/** The kinetic punctuation beat: the car-door slam at 49.0 s. */
const SLAM_SEC = 49.0;
const SLAM_FRAME = Math.round(SLAM_SEC * FPS);

/** Director's cut points (seconds) — 8 cuts across the scene. */
const CUTS_SEC = [4.2, 10.8, 17.5, 24.0, 30.6, 37.2, 43.8, 49.0];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

/** Rising energy arc with a spike at the slam and decay after. */
function buildBand(
  base: number,
  rise: number,
  wobbleFreq: number,
  wobbleAmp: number,
  slamGain: number,
  phase = 0,
): number[] {
  const out = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    let v = base + rise * t + wobbleAmp * Math.sin(i * wobbleFreq + phase);
    if (i >= SLAM_FRAME) {
      // post-slam release
      v *= Math.exp(-(i - SLAM_FRAME) / (FPS * 1.2));
    }
    // transient spike right at the slam
    if (Math.abs(i - SLAM_FRAME) <= 1) v += slamGain;
    out[i] = r5(clamp01(v));
  }
  return out;
}

/** Sparse transient band: near-silence with spikes at each cut point. */
function buildAirBand(spikeGain: number, phase = 0): number[] {
  const out = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i++) {
    out[i] = r5(clamp01(0.04 + 0.03 * Math.sin(i * 0.9 + phase)));
  }
  for (const cutSec of CUTS_SEC) {
    const f = Math.round(cutSec * FPS);
    for (let d = 0; d <= 3; d++) {
      const idx = f + d;
      if (idx < N) out[idx] = r5(clamp01(spikeGain * Math.exp(-d / 1.2) + out[idx]));
    }
  }
  // the slam is the loudest transient in the scene
  out[SLAM_FRAME] = 1;
  out[SLAM_FRAME + 1] = r5(0.72);
  return out;
}

/** Voice band with dialogue pockets: dips carved where the actors speak. */
function buildPocketBand(base: number, dips: Array<[number, number]>, dipFloor: number): number[] {
  const out = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    out[i] = r5(clamp01(base + 0.08 * Math.sin(i * 0.05)));
  }
  for (const [fromSec, toSec] of dips) {
    const from = Math.round(fromSec * FPS);
    const to = Math.round(toSec * FPS);
    for (let i = from; i < to && i < N; i++) out[i] = r5(dipFloor);
  }
  return out;
}

/** Dialogue windows (seconds) shared by both tracks' pocket shaping. */
const DIALOGUE_WINDOWS: Array<[number, number]> = [
  [6.0, 9.5],
  [19.0, 23.0],
  [33.5, 36.5],
];

function buildTempTimeline(): ForensicTimeline {
  return {
    subZero:         buildBand(0.18, 0.55, 0.13, 0.08, 0.9),
    zeroPocketZone:  buildPocketBand(0.55, DIALOGUE_WINDOWS, 0.06),
    presence:        buildBand(0.30, 0.40, 0.21, 0.10, 0.5, 1.3),
    highFidelityAir: buildAirBand(0.85),
    cmamTension:     buildBand(0.25, 0.50, 0.07, 0.06, 0.3, 0.7),
  };
}

function buildProposedTimeline(): ForensicTimeline {
  // Same structural arc, slightly different wobble character — a mirror,
  // not a clone. Pockets respect the same dialogue windows.
  return {
    subZero:         buildBand(0.16, 0.57, 0.15, 0.07, 0.88, 0.4),
    zeroPocketZone:  buildPocketBand(0.50, DIALOGUE_WINDOWS, 0.08),
    presence:        buildBand(0.28, 0.42, 0.19, 0.09, 0.5, 1.7),
    highFidelityAir: buildAirBand(0.80, 0.5),
    cmamTension:     buildBand(0.24, 0.51, 0.08, 0.05, 0.3, 1.1),
  };
}

function buildOnsets(timeline: ForensicTimeline): MajorOnset[] {
  const onsets: MajorOnset[] = CUTS_SEC.map((sec) => ({
    timeSec: sec,
    band: 'high_fidelity_air' as const,
    magnitude: r5(timeline.highFidelityAir[Math.round(sec * FPS)] ?? 0.7),
  }));
  onsets.push({ timeSec: SLAM_SEC, band: 'sub_zero', magnitude: 0.9 });
  return onsets.sort((a, b) => a.timeSec - b.timeSec);
}

const proposedTimeline = buildProposedTimeline();

export const DEMO_PRESENTATION: PresentationPayload = {
  sceneLabel: 'SC 14 · THE PARKING LOT',
  cutPointsSec: CUTS_SEC,
  durationSeconds: DURATION_SEC,
  fps: FPS,

  temp: {
    label: 'TEMP_REF_A',
    description: 'undisclosed major-label master',
    estCostUsd: 250_000,
    clearable: false,
    timeline: buildTempTimeline(),
  },
  proposed: {
    title: 'Rising Up',
    artist: 'Marlo Vance',
    clearanceCostUsd: 8_000,
    oneStopCleared: true,
    timeline: proposedTimeline,
    majorOnsets: buildOnsets(proposedTimeline),
  },

  verdict: {
    matchScore: 87.4215,
    rawMatchScore: 87.4215,
    divergence: 20.0628,
    dropFrameOffsetSec: 0.4,
    offset: {
      dropFrameOffsetSec: 0.4,
      lagFrames: 10,
      correlation: 0.7484,
      bandCorrelations: {
        subZero: 0.8112,
        cmamTension: 0.7391,
        highFidelityAir: 0.6829,
      },
    },
    zeroPocket: {
      dipFrameCount: 250,
      violatedFrameCount: 0,
      violationRatio: 0,
      penalty: 0,
    },
  },

  keyTransient: { label: 'DOOR SLAM', timeSec: SLAM_SEC },

  dealCloser: {
    quote:
      "We can't afford the reference master. But this track hits the exact " +
      'same transient when he slams the car door — the spike is in the data.',
    supportLine:
      'Frame-accurate on all 8 cuts. Zero dialogue-pocket violations. 3.2% of the reference cost.',
  },

  runnersUp: [
    {
      title: 'Concrete Sky',
      artist: 'The Holloways',
      clearanceCostUsd: 6_000,
      matchScore: 81.2047,
      note: 'Holds the build, lands the slam — warmer through the mid.',
    },
    {
      title: 'Hold the Line',
      artist: 'Junip Row',
      clearanceCostUsd: 11_000,
      matchScore: 78.9911,
      note: 'Grittier texture; the turn arrives a half-beat early, then locks.',
    },
  ],

  inputHash: 'fixture-deterministic-payload-v1',
  modelVersion: '2.0.0-phase1',
  isFixture: true,
};
