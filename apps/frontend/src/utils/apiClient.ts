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
    songArcCurve?: number[];
    songArcValenceCurve?: number[];
    /** 'measured' = extracted from the actual audio signal; 'modeled' = synthetic fallback. */
    arcSource?: 'measured' | 'modeled';
    /** 32-point normalized curves from real audio analysis — the fine-grained DNA. */
    songArcFineCurves?: { energy: number[]; brightness: number[] };
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

// ── Client-side arc fallback ──────────────────────────────────────────────────

// Canonical arc shapes per scene type (opening / held-breath / turn / release)
// and a 4-point valence curve (negative = dark, positive = bright).
const BRIEF_ARC_SHAPES: Record<string, {
  opening: number; heldBreath: number; turn: number; release: number;
  valence: [number, number, number, number];
}> = {
  'chase-tension':            { opening: 55, heldBreath: 68, turn: 82, release: 70, valence: [-8, -18, -30, -22] },
  'action-combat':            { opening: 62, heldBreath: 76, turn: 90, release: 72, valence: [-5, -12, -25, -10] },
  'heartbreak-separation':    { opening: 50, heldBreath: 38, turn: 24, release: 32, valence: [-15, -30, -50, -40] },
  'romance-intimacy':         { opening: 35, heldBreath: 48, turn: 62, release: 58, valence: [20, 35, 55, 50] },
  'emotional-resolution':     { opening: 30, heldBreath: 42, turn: 65, release: 75, valence: [-10, 5, 30, 45] },
  'drama-confrontation':      { opening: 45, heldBreath: 60, turn: 75, release: 52, valence: [-5, -15, -28, -12] },
  'suspense-dread':           { opening: 38, heldBreath: 52, turn: 68, release: 60, valence: [-18, -28, -40, -32] },
  'horror-psychological':     { opening: 32, heldBreath: 42, turn: 58, release: 40, valence: [-30, -45, -55, -42] },
  'quirky-offbeat':           { opening: 42, heldBreath: 48, turn: 55, release: 52, valence: [10, 18, 25, 22] },
  'comedy-light':             { opening: 52, heldBreath: 60, turn: 68, release: 65, valence: [22, 32, 42, 38] },
  'opening-closing-title':    { opening: 45, heldBreath: 52, turn: 58, release: 50, valence: [5, 10, 15, 10] },
  'euphoria-celebration':     { opening: 62, heldBreath: 74, turn: 88, release: 82, valence: [30, 48, 65, 58] },
  'cinematic-epic':           { opening: 55, heldBreath: 66, turn: 82, release: 76, valence: [10, 18, 28, 22] },
  'corporate-aspirational':   { opening: 45, heldBreath: 56, turn: 70, release: 74, valence: [15, 25, 38, 42] },
  'nature-pastoral':          { opening: 38, heldBreath: 42, turn: 44, release: 40, valence: [20, 25, 28, 24] },
  'montage-transition':       { opening: 42, heldBreath: 52, turn: 62, release: 55, valence: [5, 12, 20, 15] },
  'triumph-victory':          { opening: 48, heldBreath: 62, turn: 82, release: 90, valence: [10, 25, 52, 68] },
  'grief-loss':               { opening: 45, heldBreath: 32, turn: 20, release: 28, valence: [-20, -38, -55, -45] },
  'contemplative-reflective': { opening: 35, heldBreath: 40, turn: 42, release: 38, valence: [-5, 0, 5, 2] },
  'urban-gritty':             { opening: 52, heldBreath: 62, turn: 70, release: 64, valence: [-10, -15, -20, -14] },
  'sports-highlight':         { opening: 55, heldBreath: 70, turn: 84, release: 88, valence: [15, 28, 50, 62] },
  'true-crime-investigative': { opening: 40, heldBreath: 52, turn: 68, release: 58, valence: [-12, -20, -32, -22] },
  'faith-inspirational':      { opening: 42, heldBreath: 56, turn: 72, release: 82, valence: [15, 28, 48, 62] },
  'kids-family':              { opening: 52, heldBreath: 60, turn: 70, release: 74, valence: [25, 35, 48, 52] },
  'trailer-promo':            { opening: 58, heldBreath: 72, turn: 86, release: 80, valence: [5, 15, 28, 22] },
  'period-historical':        { opening: 45, heldBreath: 56, turn: 66, release: 60, valence: [0, 8, 14, 10] },
};

const DEFAULT_SHAPE = BRIEF_ARC_SHAPES['montage-transition'];

function clientFallbackArc(sceneText: string): SceneArc {
  // Classify the brief text to pick the closest canonical arc shape.
  const lower = sceneText.toLowerCase();
  let bestId = 'montage-transition';
  let bestHits = 0;

  for (const [id, shape] of Object.entries(BRIEF_ARC_SHAPES)) {
    // Simple keyword heuristic: count overlapping words from the brief id tokens.
    const tokens = id.split('-');
    const hits = tokens.filter(t => lower.includes(t) && t.length > 3).length;
    if (hits > bestHits) { bestHits = hits; bestId = id; }
  }

  const s = BRIEF_ARC_SHAPES[bestId] ?? DEFAULT_SHAPE;
  return {
    opening: s.opening,
    heldBreath: s.heldBreath,
    turn: s.turn,
    release: s.release,
    curve: [s.opening, s.heldBreath, s.turn, s.release],
    valenceCurve: [...s.valence],
    phaseCount: 4,
    narrativeCertainty: 0.38,
    signals: [],
    events: [],
    category: bestId,
    inputHash: `client-fallback-${bestId}`,
    lexiconVersion: 'fallback-1.0',
  };
}

/**
 * Extract a deterministic Scene Arc from a scene description.
 * Tries the backend first; falls back to a client-side canonical arc shape
 * so the Story Match graph always renders even without the backend.
 */
export async function extractSceneArc(
  sceneText: string,
  sceneParams?: SceneParams,
): Promise<SceneArc> {
  try {
    const res = await fetch(`${API_BASE}/api/arc/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneText, sceneParams }),
    });
    if (!res.ok) throw new Error(`extractSceneArc failed: ${res.status}`);
    return res.json() as Promise<SceneArc>;
  } catch {
    return clientFallbackArc(sceneText);
  }
}
