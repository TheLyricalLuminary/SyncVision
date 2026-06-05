import { seedEngine } from '../engine/seedEngine';

export type AnalysisResult = {
  track: {
    id: string;
    title: string;
    artistName: string | null;
    isrc: string | null;
    tempo: number | null;
    tonalCharacter: string | null;
    energyCharacter: string | null;
    rmsEnergy: number | null;
    spectralCentroid: number | null;
    audioFilePath: string | null;
  };
  confidenceScore: {
    score: number;
    confidenceLabel: string;
    explanation: string;
    sceneFitBreakdown: number;
    clearanceBreakdown: number;
    lyricsBreakdown: number;
    signalBreakdown: number;
    dataConfidence: number;
    dataConfidenceVerified: number;
    dataConfidenceTotal: number;
    vector: { scene: number; lyrics: number; audioSignal: number; rightsClarity: number };
    inputHash: string;
  };
  rightsProfile: {
    isrc?: string | null;
    isOneStop: boolean | null;
    proAffiliation: string | null;
    masterVerifiedAt: string | null;
    masterOwnedBy: string | null;
    publisherName: string | null;
    writerName: string | null;
    writerIpi?: string | null;
    splitPct?: number | null;
    blockers?: string[];
    rightsState?: string;
    syncLicenseStatus?: string | null;
    syncLicensedBy?: string | null;
    lyricLicenseStatus?: string | null;
    lyricLicensedBy?: string | null;
    enrichmentSources?: string[];
    enrichedAt?: string | null;
    territory?: string | null;
    explicitFlag?: boolean | null;
    workId?: string | null;
    genreTags?: string[];
    popularityScore?: number | null;
    enrichmentStatus?: string | null;
  } | null;
  rank: number;
};

export type SceneParams = {
  pacing: 'slow' | 'mid' | 'driving' | null;
  emotionalRegister: string | null;
  sceneLengthSec: number | null;
};

export type SubmitResponse = { jobId: string };

export type JobStatus =
  | { status: 'pending' }
  | { status: 'processing' }
  | { status: 'complete'; results: AnalysisResult[] }
  | { status: 'failed'; error: string };

export type CurrentUser = {
  id: string;
  email: string;
  planLevel: string;
  creditBalance: number;
};

const USE_SEED_ENGINE =
  (import.meta.env.VITE_USE_SEED_ENGINE ?? 'true') === 'true';

const PROD_API_FALLBACK = 'https://syncvision-api.onrender.com';

if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.warn('[SyncVision] VITE_API_URL not set — using hardcoded fallback:', PROD_API_FALLBACK);
}

export const API_BASE: string =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? PROD_API_FALLBACK : '');

console.log('[SyncVision] API base URL:', API_BASE || '(relative — dev mode)');

function getToken(): string | null {
  return localStorage.getItem('sv_token');
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    localStorage.removeItem('sv_token');
    window.location.hash = '#/login';
  }
  return res;
}

// Real API: POST /api/analysis/submit, GET /api/analysis/status/:jobId
// Set VITE_USE_SEED_ENGINE=false (default true) to route through backend.

export async function submitAnalysis(args: {
  briefText: string;
  briefId: string;
  sceneParams: SceneParams;
  trackFilenames: string[];
}): Promise<SubmitResponse> {
  if (USE_SEED_ENGINE) {
    return seedEngine.submit(args);
  }
  const res = await authedFetch('/api/analysis/submit', {
    method: 'POST',
    body: JSON.stringify({
      briefText: args.briefText,
      briefId: args.briefId,
      sceneParams: args.sceneParams,
      trackIds: args.trackFilenames,
    }),
  });
  if (!res.ok) throw new Error(`submitAnalysis failed: ${res.status}`);
  return res.json();
}

export async function pollAnalysis(jobId: string): Promise<JobStatus> {
  if (USE_SEED_ENGINE) {
    return seedEngine.poll(jobId);
  }
  const res = await authedFetch(`/api/analysis/status/${jobId}`);
  if (!res.ok) throw new Error(`pollAnalysis failed: ${res.status}`);
  return res.json();
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const token = getToken();
  if (!token) {
    return {
      id: 'guest',
      email: 'guest@syncvision.local',
      planLevel: 'COMPOSER',
      creditBalance: 50,
    };
  }
  const res = await authedFetch('/api/auth/me');
  if (!res.ok) throw new Error(`fetchCurrentUser failed: ${res.status}`);
  const body = (await res.json()) as {
    userId: string;
    email: string;
    planLevel: string;
  };
  return {
    id: body.userId,
    email: body.email,
    planLevel: body.planLevel,
    creditBalance: 50,
  };
}

export function isUsingSeedEngine(): boolean {
  return USE_SEED_ENGINE;
}
