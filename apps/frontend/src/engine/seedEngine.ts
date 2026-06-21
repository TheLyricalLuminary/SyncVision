import type {
  AnalysisResult,
  ArcMatchResult,
  JobStatus,
  SceneArc,
  SceneParams,
  SubmitResponse,
} from '../utils/apiClient';

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
        job.results = mapResponse(data, args.briefId).map((result, i) => ({
          ...result,
          rank: i + 1,
          confidenceScore: {
            ...result.confidenceScore,
            ...syntheticArcData(result.track.id, sceneArc, result.confidenceScore.score),
          },
        }));
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
