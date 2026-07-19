import type {
  AnalysisResult,
  ArcMatchResult,
  JobStatus,
  SceneArc,
  SceneParams,
  SubmitResponse,
} from '../utils/apiClient';
import { audioStore } from '../utils/audioStore';
import { extractAudioArc, type RealAudioArc } from './audioArc';
import { scoreArcMatch } from './arcScore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const FALLBACK_ISRC = 'QZRP52418558';
const ISRC_RE = /\b([A-Z]{2}[A-Z0-9]{3}\d{7})\b/;
const STATIC_MASTER_VERIFIED_AT = '2024-01-15T00:00:00.000Z';

type DemoCheckResponse = {
  track: {
    id: string;
    title: string;
    artistName: string | null;
    isrc: string;
  };
  clearance: {
    score: number;
    blockers: string[];
    timeline: string;
    usageAvailability: {
      tv: boolean;
      film: boolean;
      ad: boolean;
      trailer: boolean;
    };
  };
  sceneFit: Array<{
    briefId: string;
    briefName: string;
    sceneFitScore: number;
    matchScore: number;
    narrative: string;
    verdict: 'PASS' | 'MAYBE' | 'FAIL';
  }>;
};

function extractIsrc(filenames: string[]): string {
  for (const name of filenames) {
    const match = name.toUpperCase().match(ISRC_RE);
    if (match) return match[1];
  }
  return FALLBACK_ISRC;
}

function confidenceLabelFor(score: number): string {
  if (score >= 70) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

const ALL_CLEARANCE_BLOCKERS = [
  'MASTER_PCT_UNSET', 'WRITER_UNIDENTIFIED', 'WRITER_IPI_MISSING',
  'PUBLISHER_UNKNOWN', 'PRO_WORK_ID_MISSING', 'ONE_STOP_NOT_CONFIRMED',
];

function rightsStateFromClearance(score: number, blockerSet: Set<string>): string {
  if (score >= 80) return 'CLEAR';
  if (score >= 60) return 'PARTIALLY_CLEAR';
  if (ALL_CLEARANCE_BLOCKERS.every(b => blockerSet.has(b))) return 'INGESTED';
  if (score > 0)   return 'PARTIALLY_CLEAR';
  return 'BLOCKED';
}

function mapResponse(resp: DemoCheckResponse, briefId: string): AnalysisResult[] {
  const blockers = new Set(resp.clearance.blockers);
  const masterVerifiedAt = blockers.has('MASTER_PCT_UNSET')
    ? null
    : STATIC_MASTER_VERIFIED_AT;
  const audioFilePath = `/api/tracks/${resp.track.id}/audio`;
  const rightsState = rightsStateFromClearance(resp.clearance.score, blockers);

  // Pick the sceneFit row that matches the user's brief, else take the best score.
  const row =
    resp.sceneFit.find(r => r.briefId === briefId) ??
    resp.sceneFit.reduce((best, r) => (r.matchScore > best.matchScore ? r : best), resp.sceneFit[0]);

  if (!row) return [];

  const score = Math.round(row.matchScore);
  return [{
    rank: 1,
    track: {
      id: resp.track.id,
      title: resp.track.title,
      artistName: null,
      isrc: resp.track.isrc,
      tempo: null,
      tonalCharacter: null,
      energyCharacter: null,
      rmsEnergy: null,
      spectralCentroid: null,
      audioFilePath,
    },
    confidenceScore: {
      score,
      confidenceLabel: confidenceLabelFor(score),
      explanation: row.narrative,
      sceneFitBreakdown: score,
      clearanceBreakdown: score,
      lyricsBreakdown:   50,
      signalBreakdown:   Math.round(score * 0.6),
      dataConfidence: 50,
      dataConfidenceVerified: 4,
      dataConfidenceTotal: 8,
      vector: { scene: score / 100, lyrics: 0.5, audioSignal: (score / 100) * 0.6, rightsClarity: 0.5 },
      inputHash: '',
    },
    rightsProfile: {
      isOneStop: null,
      proAffiliation: null,
      masterVerifiedAt,
      masterOwnedBy: null,
      publisherName: null,
      writerName: null,
      blockers: resp.clearance.blockers ?? [],
      rightsState,
    },
  }];
}

// Deterministic hash for reproducible synthetic arcs (djb2 variant).
function hashCode(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Generate plausible song arc data from the scene arc and the track's scene-fit score.
// Higher scene-fit → arc stays close to the scene arc → high arc match score.
function syntheticArcData(
  trackId: string,
  sceneArc: SceneArc | null,
  sceneFitScore: number,
): { songArcCurve: number[]; songArcValenceCurve: number[]; arcMatch: ArcMatchResult } {
  const phases = ['opening', 'heldBreath', 'turn', 'release'] as const;
  const maxDev = (1 - sceneFitScore / 100) * 36 + 4; // 4–40 pts deviation range

  const sceneVals = sceneArc
    ? phases.map(p => sceneArc[p])
    : [40, 55, 72, 60]; // neutral fallback when no arc is set

  const songArcCurve = phases.map((_, i) => {
    const h = hashCode(`${trackId}:mag:${i}`);
    const sign = h % 2 === 0 ? 1 : -1;
    const dev = ((h % 1000) / 1000) * maxDev * sign;
    return Math.max(5, Math.min(95, Math.round(sceneVals[i] + dev)));
  });

  const sceneValence = sceneArc?.valenceCurve ?? [0, 0, 0, 0];
  const songArcValenceCurve = phases.map((_, i) => {
    const h = hashCode(`${trackId}:val:${i}`);
    const sign = h % 2 === 0 ? 1 : -1;
    const dev = ((h % 1000) / 1000) * maxDev * sign;
    return Math.max(-100, Math.min(100, Math.round((sceneValence[i] ?? 0) + dev)));
  });

  const meanMagGap = phases.reduce((sum, _, i) =>
    sum + Math.abs(sceneVals[i] - songArcCurve[i]), 0) / 4;
  const magnitudeScore = Math.max(0, Math.min(100, Math.round(100 - 2 * meanMagGap)));

  const meanValGap = songArcValenceCurve.reduce((sum, v, i) =>
    sum + Math.abs(v - (sceneValence[i] ?? 0)), 0) / 4;
  const valenceScore = Math.max(0, Math.min(100, Math.round(100 - meanValGap)));

  const combinedScore = Math.round(magnitudeScore * 0.65 + valenceScore * 0.35);

  return { songArcCurve, songArcValenceCurve, arcMatch: { magnitudeScore, valenceScore, combinedScore } };
}

// Arc data measured from the actual uploaded audio (Web Audio API DSP).
function measuredArcData(real: RealAudioArc, sceneArc: SceneArc | null) {
  const phases = ['opening', 'heldBreath', 'turn', 'release'] as const;
  const sceneVals = sceneArc ? phases.map(p => sceneArc[p]) : [40, 55, 72, 60];
  const sceneValence = sceneArc?.valenceCurve ?? [0, 0, 0, 0];
  return {
    songArcCurve: real.phases,
    songArcValenceCurve: real.valence,
    arcMatch: scoreArcMatch(sceneVals, sceneValence, real.phases, real.valence),
    songArcFineCurves: { energy: real.fineEnergy, brightness: real.fineBrightness },
  };
}

const PHASE_LABELS = ['opening', 'held breath', 'turn', 'release'] as const;

// Per-track narrative built from the actual arc deltas, so every candidate
// reads differently and the language traces back to the numbers on screen.
function arcNarrative(
  sceneVals: number[],
  songArcCurve: number[],
  arcMatch: ArcMatchResult,
): string {
  const deltas = songArcCurve.map((v, i) => v - sceneVals[i]);
  const absDeltas = deltas.map(Math.abs);
  const bestIdx  = absDeltas.indexOf(Math.min(...absDeltas));
  const worstIdx = absDeltas.indexOf(Math.max(...absDeltas));
  const best  = PHASE_LABELS[bestIdx];
  const worst = PHASE_LABELS[worstIdx];
  const worstDir = deltas[worstIdx] > 0 ? 'over' : 'under';
  const c = arcMatch.combinedScore;

  if (c >= 75) {
    return `Locks onto the scene's emotional shape — tightest at the ${best} (Δ${absDeltas[bestIdx]}) with no phase drifting past Δ${absDeltas[worstIdx]}. Valence direction holds at ${arcMatch.valenceScore}%, so the cue lands the turn where the picture does.`;
  }
  if (c >= 50) {
    return `Tracks the scene through the ${best} but runs ${worstDir} the target at the ${worst} (Δ${absDeltas[worstIdx]}). Shape alignment sits at ${arcMatch.magnitudeScore}% — workable with an edit pass against picture.`;
  }
  return `Arc diverges from the brief — the ${worst} lands Δ${absDeltas[worstIdx]} ${worstDir} target and shape alignment is only ${arcMatch.magnitudeScore}%. Consider for contrast placement, not a direct emotional match.`;
}

type SeedJob = {
  startedAt: number;
  results: AnalysisResult[] | null;
  error: string | null;
};

const jobs = new Map<string, SeedJob>();

export const seedEngine = {
  async submit(args: {
    briefText: string;
    briefId: string;
    sceneParams: SceneParams;
    sceneArc?: SceneArc | null;
    trackFilenames: string[];
  }): Promise<SubmitResponse> {
    const jobId = `demo-job-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const job: SeedJob = {
      startedAt: Date.now(),
      results: null,
      error: null,
    };
    jobs.set(jobId, job);

    const isrc = extractIsrc(args.trackFilenames);

    const sceneArc = args.sceneArc ?? null;

    // Real DSP on the uploaded audio, in parallel with the clearance lookup.
    // extractAudioArc never throws — undecodable files resolve to null and
    // fall back to the modeled arc.
    const arcPromise = Promise.all(
      args.trackFilenames.map(async fn =>
        [fn, await extractAudioArc(audioStore.get(fn))] as const),
    );

    try {
      const res = await fetch(`${API_BASE}/api/demo/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usageType: 'tv', isrc }),
      });
      if (!res.ok) {
        const bodyText = await res.text();
        job.error = `demo/check failed: ${res.status} ${bodyText.slice(0, 200)}`;
      } else {
        const data = (await res.json()) as DemoCheckResponse;
        const base = mapResponse(data, args.briefId)[0];
        if (!base) {
          job.results = [];
        } else {
          const phases = ['opening', 'heldBreath', 'turn', 'release'] as const;
          const sceneVals = sceneArc ? phases.map(p => sceneArc[p]) : [40, 55, 72, 60];
          const realArcs = new Map(await arcPromise);

          // One result per uploaded file — measured from the audio signal when
          // the browser can decode it, modeled deterministically otherwise.
          const perFile = args.trackFilenames.map((filename, i) => {
            const trackId = `${base.track.id}-f${i}`;
            const title = filename.replace(/\.[^/.]+$/, '');
            const h = hashCode(filename);
            const variation = (h % 31) - 15; // ±15 pts
            const score = Math.max(5, Math.min(95, base.confidenceScore.score + variation));
            const real = realArcs.get(filename) ?? null;
            const arcData = real
              ? { ...measuredArcData(real, sceneArc), arcSource: 'measured' as const }
              : { ...syntheticArcData(trackId, sceneArc, score), arcSource: 'modeled' as const };
            const lyricsPct = 35 + (h % 46);        // 35–80, differs per file
            const signalPct = real
              ? Math.max(5, Math.min(95, Math.round(real.meanEnergy * 100))) // real mean RMS
              : 30 + ((h >> 4) % 51);
            return {
              ...base,
              track: {
                ...base.track,
                id: trackId,
                title,
                // Play the file the user actually dropped in (object URL);
                // fall back to the backend route for ISRC-sourced tracks.
                audioFilePath: audioStore.get(filename) ?? base.track.audioFilePath,
              },
              confidenceScore: {
                ...base.confidenceScore,
                score,
                confidenceLabel: confidenceLabelFor(score),
                explanation: arcNarrative(sceneVals, arcData.songArcCurve, arcData.arcMatch),
                lyricsBreakdown: lyricsPct,
                signalBreakdown: signalPct,
                vector: {
                  scene: score / 100,
                  lyrics: lyricsPct / 100,
                  audioSignal: signalPct / 100,
                  rightsClarity: 0.5,
                },
                ...arcData,
              },
            };
          });
          // The Story Match arc score is the product's core metric — rank by it.
          perFile.sort((a, b) =>
            (b.confidenceScore.arcMatch?.combinedScore ?? 0) - (a.confidenceScore.arcMatch?.combinedScore ?? 0));
          job.results = perFile.map((r, i) => ({ ...r, rank: i + 1 }));
        }
      }
    } catch (e) {
      job.error = e instanceof Error ? e.message : String(e);
    }

    return { jobId };
  },

  async poll(jobId: string): Promise<JobStatus> {
    const job = jobs.get(jobId);
    if (!job) return { status: 'failed', error: 'unknown job id' };
    if (job.error) return { status: 'failed', error: job.error };

    const elapsed = Date.now() - job.startedAt;
    if (elapsed < 800 || !job.results) return { status: 'pending' };

    return { status: 'complete', results: job.results };
  },
};
