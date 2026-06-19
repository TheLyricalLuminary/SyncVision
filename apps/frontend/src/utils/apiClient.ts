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
    arcMatch?: ArcMatchResult;
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

// ── Scene Arc (deterministic extraction — POST /api/arc/extract) ─────────────

export type ArcSignalEvent = {
  id: string;
  label: string;
  matched: string; // the exact trigger phrase that fired (provenance)
  offset: number;
  sentence: number; // 1-based sentence of first match
  intensity: 1 | 2 | 3;
  count: number;
};

export type SceneArc = {
  opening: number;
  heldBreath: number;
  turn: number;
  release: number;
  curve: number[]; // magnitude curve (expandable resolution; 4 in v1)
  valenceCurve: number[]; // signed emotional direction, -100..100
  phaseCount: number;
  narrativeCertainty: number; // 0–1
  signals: string[];
  events: ArcSignalEvent[];
  category: string | null;
  inputHash: string;
  lexiconVersion: string;
};

/** The four-phase magnitude values a supervisor may manually adjust. */
export type ArcPhases = Pick<SceneArc, 'opening' | 'heldBreath' | 'turn' | 'release'>;

export type ArcMatchResult = {
  magnitudeScore: number; // 0–100 shape similarity
  valenceScore:   number; // 0–100 direction alignment
  combinedScore:  number; // 0–100 final match quality
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

if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.error('[SyncVision] VITE_API_URL is not set — API calls will fail in production. Set this to the Railway backend public URL before building.');
}

export const API_BASE: string = import.meta.env.VITE_API_URL || '';

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
  sceneArc?: SceneArc | null;
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
      sceneArc: args.sceneArc ?? undefined,
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

/**
 * Extract a deterministic Scene Arc from a scene description.
 * Always hits the backend (deterministic engine, server-authoritative) — never
 * the seed engine. In dev the Vite proxy forwards /api to the backend.
 */
export async function extractSceneArc(
  sceneText: string,
  sceneParams?: SceneParams,
): Promise<SceneArc> {
  const res = await fetch(`${API_BASE}/api/arc/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneText, sceneParams }),
  });
  if (!res.ok) throw new Error(`extractSceneArc failed: ${res.status}`);
  return res.json();
}
