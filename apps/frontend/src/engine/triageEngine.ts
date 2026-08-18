import { extractSceneArc, type SceneParams, type SceneArc } from '../utils/apiClient';
import { scoreArcMatch } from './arcScore';
import { CLEARABLE_LIBRARY, type ClearableTrack } from './clearableLibrary';
import { classifyBrief } from './classifyBrief';
import type { CueSheetRow, RightsStatus } from './cueSheet';

export type RiskBreakdown = {
  rights: number;
  budget: number;
  urgency: number;
  total: number;
  tier: 'high' | 'medium' | 'low';
};

export type LibraryMatch = { track: ClearableTrack; matchPct: number };

export type TriageRow = {
  input: CueSheetRow;
  risk: RiskBreakdown;
  /** null when there's no description to classify — never fabricated. */
  arcSource: 'measured-text' | 'unavailable';
  arc: SceneArc | null;
  topMatches: LibraryMatch[];
};

// ── risk score — transparent, additive, capped at 100 ──────────────────────
// Not a black box: every point traces to rights status, dollars exposed, or
// days until lock. Shown broken out in the UI so a supervisor can audit it.

const RIGHTS_WEIGHT: Record<RightsStatus, number> = {
  cleared: 0,
  pending: 30,
  unclear: 55,
  unknown: 40,
};

function budgetWeight(usd: number | null): number {
  if (usd == null) return 10; // unestimated — assume moderate exposure
  const REFERENCE_CEILING = 50_000;
  return Math.min(25, Math.round((Math.min(usd, REFERENCE_CEILING) / REFERENCE_CEILING) * 25));
}

function urgencyWeight(days: number | null): number {
  if (days == null) return 8;
  if (days <= 3) return 25;
  if (days <= 7) return 18;
  if (days <= 14) return 12;
  if (days <= 30) return 6;
  return 2;
}

export function scoreRisk(row: CueSheetRow): RiskBreakdown {
  const rights  = RIGHTS_WEIGHT[row.rightsStatus];
  const budget  = budgetWeight(row.budgetUsd);
  const urgency = urgencyWeight(row.daysToLock);
  const total = Math.min(100, rights + budget + urgency);
  const tier: RiskBreakdown['tier'] = total >= 65 ? 'high' : total >= 35 ? 'medium' : 'low';
  return { rights, budget, urgency, total, tier };
}

// ── library match — same scoreArcMatch used everywhere else in the app ─────

export function matchLibrary(targetMag: number[], targetVal: number[], topN = 1): LibraryMatch[] {
  return CLEARABLE_LIBRARY
    .map(track => ({ track, matchPct: scoreArcMatch(targetMag, targetVal, track.arc, track.valence).combinedScore }))
    .sort((a, b) => b.matchPct - a.matchPct)
    .slice(0, topN);
}

const DEFAULT_SCENE_PARAMS: SceneParams = { pacing: null, emotionalRegister: null, sceneLengthSec: null };

/** Runs N async jobs with a max concurrency, preserving input order in the result. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(worker));
  return results;
}

/**
 * Runs full triage over a cue sheet: risk score (sync, free) + arc match
 * against the built-in clearable library (needs a scene description to
 * classify — rows without one still get a risk score, just no match).
 * Arc extraction hits the backend with a client-side fallback, so this works
 * offline too. Capped concurrency so a 150-row sheet doesn't fire 150
 * requests at once.
 */
export async function runTriage(
  rows: CueSheetRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<TriageRow[]> {
  let done = 0;
  const out = await mapWithConcurrency(rows, 4, async (row): Promise<TriageRow> => {
    const risk = scoreRisk(row);
    let topMatches: LibraryMatch[] = [];
    let arcSource: TriageRow['arcSource'] = 'unavailable';
    let arc: SceneArc | null = null;

    const canClassify = classifyBrief(row.description) !== null;
    if (canClassify) {
      arc = await extractSceneArc(row.description, DEFAULT_SCENE_PARAMS);
      topMatches = matchLibrary(
        [arc.opening, arc.heldBreath, arc.turn, arc.release],
        arc.valenceCurve,
        3,
      );
      arcSource = 'measured-text';
    }

    done++;
    onProgress?.(done, rows.length);
    return { input: row, risk, arcSource, arc, topMatches };
  });

  return out.sort((a, b) => b.risk.total - a.risk.total || (b.input.budgetUsd ?? 0) - (a.input.budgetUsd ?? 0));
}

export function worklistToCsv(rows: TriageRow[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Scene', 'Temp Artist', 'Temp Title', 'Rights Status', 'Budget USD', 'Days to Lock', 'Risk Score', 'Risk Tier', 'Best Clearable Match', 'Match Artist', 'Match %', 'License', 'Clearance Cost USD'];
  const lines = rows.map(r => {
    const best = r.topMatches[0];
    return [
      r.input.scene, r.input.tempArtist, r.input.tempTitle, r.input.rightsStatus,
      r.input.budgetUsd ?? '', r.input.daysToLock ?? '',
      r.risk.total, r.risk.tier,
      best?.track.title ?? '', best?.track.artist ?? '', best?.matchPct ?? '',
      best?.track.license ?? '', best?.track.clearanceCostUsd ?? '',
    ].map(esc).join(',');
  });
  return [header.join(','), ...lines].join('\r\n');
}
