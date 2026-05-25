import type {
  AnalysisResult,
  JobStatus,
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

function mapResponse(resp: DemoCheckResponse): AnalysisResult[] {
  const blockers = new Set(resp.clearance.blockers);
  const masterVerifiedAt = blockers.has('MASTER_PCT_UNSET')
    ? null
    : STATIC_MASTER_VERIFIED_AT;
  const audioFilePath = `/api/tracks/${resp.track.id}/audio`;
  const rightsState = rightsStateFromClearance(resp.clearance.score, blockers);

  const results: AnalysisResult[] = resp.sceneFit.map((row) => {
    const score = Math.round(row.matchScore);
    return {
      rank: 0,
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
        rightsBreakdown:   score,
        lyricsBreakdown:   50,
        signalBreakdown:   Math.round(score * 0.6),
        vector: { scene: score / 100, rights: score / 100, lyrics: 0.5, signal: (score / 100) * 0.6 },
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
    };
  });

  results.sort((a, b) => b.confidenceScore.score - a.confidenceScore.score);
  results.forEach((r, i) => {
    r.rank = i + 1;
  });
  return results;
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
        job.results = mapResponse(data);
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
