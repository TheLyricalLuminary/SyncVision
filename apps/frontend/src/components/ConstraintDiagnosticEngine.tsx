/**
 * SyncVision Constraint Diagnostic Engine (SCDE)
 *
 * PRIMARY CONTRACT:
 *   Given catalog C and constraint set K derived from a scene brief,
 *   compute feasible set F ⊆ C and the full attribution of why all
 *   other elements are excluded.
 *
 * INTERMEDIATE REPRESENTATION:
 *   Every track is first converted to a Track Constraint Vector (TCV).
 *   All outputs derive from TCVs — nothing is computed ad-hoc in sections.
 *
 * OUTPUT HIERARCHY (enforced, non-negotiable):
 *   1. Feasible Set Summary          — |C|, |F|, survival %
 *   2. Constraint Elimination Table  — ranked by elimination impact
 *   3. Bottleneck Analysis           — argmax elimination constraint
 *   4. Interaction Collapse Signals  — non-additive constraint pairs
 *   5. Sensitivity Analysis          — ΔF per constraint relaxation
 *   6. Exemplar Set                  — F annotated with TCV margins
 *
 * BANNED FROM OUTPUT:
 *   - Confidence scores or labels (high/medium/low)
 *   - Subjective rankings without constraint attribution
 *   - Narrative explanations without set-size grounding
 *   - Any output not derivable from TCV
 */

import { useMemo, useState } from 'react';
import type { AnalysisResult, SceneArc } from '../utils/apiClient';

// ─── design tokens ────────────────────────────────────────────────────────────
const C = {
  surface:       '#130B2B',
  surfaceRaised: '#160D2E',
  hover:         'rgba(255,255,255,0.03)',
  hairline:      'rgba(255,255,255,0.07)',
  hairlineMid:   'rgba(255,255,255,0.12)',
  amber:         '#F5B544',
  amberDim:      'rgba(245,181,68,0.50)',
  amberFaint:    'rgba(245,181,68,0.09)',
  magenta:       '#DB2777',
  lavender:      '#9B93C4',
  lavenderDim:   'rgba(155,147,196,0.50)',
  lavenderFaint: 'rgba(155,147,196,0.07)',
  silver:        '#E8E4F0',
  silverDim:     'rgba(232,228,240,0.65)',
  green:         '#22C55E',
  greenFaint:    'rgba(34,197,94,0.08)',
  orange:        '#F97316',
  orangeFaint:   'rgba(249,115,22,0.09)',
  red:           '#EF4444',
  redFaint:      'rgba(239,68,68,0.07)',
};
const SANS  = '"Inter", system-ui, sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO  = '"JetBrains Mono", monospace';

// ─── SVG constants ────────────────────────────────────────────────────────────
const W = 560, H = 100;
const PL = 8, PR = 8, PT = 16, PB = 6;
const PW = W - PL - PR, PH = H - PT - PB;
const TENSION = 0.35;
const PHASE_F = [0, 1/3, 2/3, 1];
const PHASE_LBL = ['Opening', 'Held Breath', 'Turn', 'Release'];

function svgX(f: number) { return PL + f * PW; }
function svgY(v: number) { return PT + PH * (1 - Math.max(0, Math.min(1, v))); }

function catmullRomPath(pts: [number, number][]): string {
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
    const p2 = pts[i + 1],             p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) * TENSION, c1y = p1[1] + (p2[1] - p0[1]) * TENSION;
    const c2x = p2[0] - (p3[0] - p1[0]) * TENSION, c2y = p2[1] - (p3[1] - p1[1]) * TENSION;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// ─── CONSTRAINT MODEL ─────────────────────────────────────────────────────────

/**
 * Evaluation function types — each constraint must declare its type.
 * This makes the constraint model mechanically inspectable, not narrative.
 *
 *   binary_filter     — pass/fail with no continuous margin (e.g. tonality membership)
 *   threshold_filter  — numeric threshold with continuous margin
 *   temporal_alignment— position-based test (peak timing relative to scene phases)
 *   curve_match       — shape correlation (e.g. arc match score)
 *   fuzzy_window      — within ±tolerance of a target value
 */
type ConstraintType =
  | 'binary_filter'
  | 'threshold_filter'
  | 'temporal_alignment'
  | 'curve_match'
  | 'fuzzy_window';

type Relaxation = {
  /** Short label — appears in table */
  label: string;
  /** One-sentence description of what changed */
  mutation: string;
  /** Relaxed test function */
  test: (r: AnalysisResult) => boolean;
  /** Relaxed margin function (may be same type as parent) */
  margin: (r: AnalysisResult) => number | null;
};

type ConstraintDef = {
  id: string;
  label: string;
  type: ConstraintType;
  /** Deterministic pass/fail gate */
  test: (r: AnalysisResult) => boolean;
  /**
   * Margin ∈ [0, 1]: how far from the failure boundary is this track?
   * 0 = barely passing, 1 = firmly passing.
   * null = track is failing (margin only meaningful for passing tracks)
   *        OR constraint is binary_filter (no continuous margin)
   */
  margin: (r: AnalysisResult) => number | null;
  /** Ordered relaxations from least to most permissive */
  relaxations: Relaxation[];
  /** Returns false if constraint is irrelevant given scene arc shape */
  relevant: (arc: SceneArc | null) => boolean;
};

const CONSTRAINT_DEFS: ConstraintDef[] = [

  // ── temporal_alignment ──────────────────────────────────────────────────────

  {
    id: 'peak_at_or_after_turn',
    label: 'Peak at or after turn',
    type: 'temporal_alignment',
    test: (r) => {
      const c = r.confidenceScore.songArcCurve;
      return !!c && c.length >= 3 && c[2] >= c[1] - 0.03;
    },
    margin: (r) => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 3 || c[2] < c[1] - 0.03) return null;
      return Math.min(1, (c[2] - c[1] + 0.03) / 0.50);
    },
    relaxations: [
      {
        label: 'Turn within 12% of peak',
        mutation: 'Allows turn up to 12% below held-breath',
        test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 3 && c[2] >= c[1] - 0.12; },
        margin: (r) => {
          const c = r.confidenceScore.songArcCurve;
          if (!c || c.length < 3 || c[2] < c[1] - 0.12) return null;
          return Math.min(1, (c[2] - c[1] + 0.12) / 0.60);
        },
      },
      {
        label: 'Turn within 25% of peak',
        mutation: 'Allows turn up to 25% below held-breath',
        test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 3 && c[2] >= c[1] - 0.25; },
        margin: (r) => {
          const c = r.confidenceScore.songArcCurve;
          if (!c || c.length < 3 || c[2] < c[1] - 0.25) return null;
          return Math.min(1, (c[2] - c[1] + 0.25) / 0.75);
        },
      },
    ],
    relevant: () => true,
  },

  {
    id: 'delayed_release',
    label: 'Delayed emotional release',
    type: 'temporal_alignment',
    test: (r) => {
      const c = r.confidenceScore.songArcCurve;
      return !!c && c.length >= 4 && c[2] >= 0.48 && c[3] < c[2] - 0.18;
    },
    margin: (r) => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 4 || c[2] < 0.48 || c[3] >= c[2] - 0.18) return null;
      return Math.min(1, (c[2] - c[3] - 0.18) / 0.32);
    },
    relaxations: [
      {
        label: 'Drop > 10% threshold',
        mutation: 'Resolution must drop at least 10% (was 18%)',
        test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 4 && c[2] >= 0.42 && c[3] < c[2] - 0.10; },
        margin: (r) => {
          const c = r.confidenceScore.songArcCurve;
          if (!c || c.length < 4 || c[2] < 0.42 || c[3] >= c[2] - 0.10) return null;
          return Math.min(1, (c[2] - c[3] - 0.10) / 0.40);
        },
      },
      {
        label: 'Any resolution drop',
        mutation: 'Resolution must be lower than peak (threshold removed)',
        test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 4 && c[3] < c[2]; },
        margin: (r) => {
          const c = r.confidenceScore.songArcCurve;
          if (!c || c.length < 4 || c[3] >= c[2]) return null;
          return Math.min(1, (c[2] - c[3]) / 0.50);
        },
      },
    ],
    relevant: (a) => !a || (a.turn - a.release) > 12,
  },

  // ── threshold_filter ────────────────────────────────────────────────────────

  {
    id: 'restrained_opening',
    label: 'Restrained opening',
    type: 'threshold_filter',
    test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c[0] <= 0.38; },
    margin: (r) => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c[0] > 0.38) return null;
      return Math.min(1, (0.38 - c[0]) / 0.38);
    },
    relaxations: [
      {
        label: 'Opening ≤ 50%',
        mutation: 'Raises opening threshold from 38% to 50%',
        test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c[0] <= 0.50; },
        margin: (r) => {
          const c = r.confidenceScore.songArcCurve;
          if (!c || c[0] > 0.50) return null;
          return Math.min(1, (0.50 - c[0]) / 0.50);
        },
      },
      {
        label: 'Opening ≤ 65%',
        mutation: 'Raises opening threshold from 38% to 65%',
        test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c[0] <= 0.65; },
        margin: (r) => {
          const c = r.confidenceScore.songArcCurve;
          if (!c || c[0] > 0.65) return null;
          return Math.min(1, (0.65 - c[0]) / 0.65);
        },
      },
    ],
    relevant: (a) => !a || a.opening < 50,
  },

  {
    id: 'sustained_tension',
    label: 'Sustained tension through turn',
    type: 'threshold_filter',
    test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 3 && c[1] >= 0.52 && c[2] >= 0.50; },
    margin: (r) => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 3 || c[1] < 0.52 || c[2] < 0.50) return null;
      return Math.min(1, Math.min((c[1] - 0.52) / 0.48, (c[2] - 0.50) / 0.50));
    },
    relaxations: [
      {
        label: 'Held-breath ≥ 42%, Turn ≥ 40%',
        mutation: 'Lowers tension floor from 52%/50% to 42%/40%',
        test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 3 && c[1] >= 0.42 && c[2] >= 0.40; },
        margin: (r) => {
          const c = r.confidenceScore.songArcCurve;
          if (!c || c.length < 3 || c[1] < 0.42 || c[2] < 0.40) return null;
          return Math.min(1, Math.min((c[1] - 0.42) / 0.58, (c[2] - 0.40) / 0.60));
        },
      },
      {
        label: 'Held-breath ≥ 30%, Turn ≥ 28%',
        mutation: 'Lowers tension floor from 52%/50% to 30%/28%',
        test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 3 && c[1] >= 0.30 && c[2] >= 0.28; },
        margin: (r) => {
          const c = r.confidenceScore.songArcCurve;
          if (!c || c.length < 3 || c[1] < 0.30 || c[2] < 0.28) return null;
          return Math.min(1, Math.min((c[1] - 0.30) / 0.70, (c[2] - 0.28) / 0.72));
        },
      },
    ],
    relevant: () => true,
  },

  {
    id: 'sustained_build',
    label: 'Build through first act',
    type: 'threshold_filter',
    test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 2 && c[1] > c[0] + 0.14; },
    margin: (r) => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 2 || c[1] <= c[0] + 0.14) return null;
      return Math.min(1, (c[1] - c[0] - 0.14) / 0.40);
    },
    relaxations: [
      {
        label: 'Rise > 8%',
        mutation: 'Reduces required first-act rise from 14% to 8%',
        test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 2 && c[1] > c[0] + 0.08; },
        margin: (r) => {
          const c = r.confidenceScore.songArcCurve;
          if (!c || c.length < 2 || c[1] <= c[0] + 0.08) return null;
          return Math.min(1, (c[1] - c[0] - 0.08) / 0.50);
        },
      },
      {
        label: 'Any rise',
        mutation: 'First act must not decline (rise threshold removed)',
        test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 2 && c[1] >= c[0]; },
        margin: (r) => {
          const c = r.confidenceScore.songArcCurve;
          if (!c || c.length < 2 || c[1] < c[0]) return null;
          return Math.min(1, (c[1] - c[0]) / 0.50);
        },
      },
    ],
    relevant: (a) => !a || (a.heldBreath - a.opening) > 14,
  },

  // ── curve_match ─────────────────────────────────────────────────────────────

  {
    id: 'arc_alignment',
    label: 'Arc alignment (combinedScore ≥ 70)',
    type: 'curve_match',
    test: (r) => { const m = r.confidenceScore.arcMatch; return !!m && m.combinedScore >= 70; },
    margin: (r) => {
      const m = r.confidenceScore.arcMatch;
      if (!m || m.combinedScore < 70) return null;
      return Math.min(1, (m.combinedScore - 70) / 30);
    },
    relaxations: [
      {
        label: 'Score ≥ 55',
        mutation: 'Lowers arc alignment requirement from 70 to 55',
        test: (r) => { const m = r.confidenceScore.arcMatch; return !!m && m.combinedScore >= 55; },
        margin: (r) => {
          const m = r.confidenceScore.arcMatch;
          if (!m || m.combinedScore < 55) return null;
          return Math.min(1, (m.combinedScore - 55) / 45);
        },
      },
      {
        label: 'Score ≥ 40',
        mutation: 'Lowers arc alignment requirement from 70 to 40',
        test: (r) => { const m = r.confidenceScore.arcMatch; return !!m && m.combinedScore >= 40; },
        margin: (r) => {
          const m = r.confidenceScore.arcMatch;
          if (!m || m.combinedScore < 40) return null;
          return Math.min(1, (m.combinedScore - 40) / 60);
        },
      },
    ],
    relevant: () => true,
  },

  // ── binary_filter ────────────────────────────────────────────────────────────

  {
    id: 'minor_tonality',
    label: 'Minor or dark tonality',
    type: 'binary_filter',
    test: (r) => {
      const t = (r.track.tonalCharacter ?? '').toLowerCase();
      return t.includes('minor') || t.includes('dorian') || t.includes('phryg');
    },
    margin: () => null, // binary_filter: no continuous margin
    relaxations: [
      {
        label: 'Include modal or unclassified',
        mutation: 'Accepts modal, unknown, or unclassified tonal character',
        test: (r) => {
          const t = (r.track.tonalCharacter ?? '').toLowerCase();
          return !t || t.includes('minor') || t.includes('dorian') || t.includes('phryg') || t.includes('modal') || t.includes('unknown');
        },
        margin: () => null,
      },
      {
        label: 'Remove tonality constraint',
        mutation: 'Tonal character no longer required',
        test: () => true,
        margin: () => null,
      },
    ],
    relevant: (a) => !a || (a.signals ?? []).some(s => /conflict|dark|betray|grief|loss|tension/i.test(s)),
  },
];

// ─── INTERMEDIATE REPRESENTATION ─────────────────────────────────────────────

/** Evaluation result for one constraint on one track. */
type ConstraintEval = {
  id: string;
  pass: boolean;
  /** Margin ∈ [0,1] — only meaningful when pass=true. Null for binary_filter. */
  margin: number | null;
};

/**
 * Track Constraint Vector — the formal IR.
 * Every downstream output derives from this. Nothing is computed ad-hoc.
 */
type TCV = {
  trackId: string;
  evals: Record<string, ConstraintEval>;
  feasible: boolean;
  /** Constraint IDs that fail, ordered by elimination impact (set after ranking) */
  failures: string[];
  violationCount: number;
};

type EliminationRow = {
  def: ConstraintDef;
  /** |F(K \ {Ki})| — feasible set without this constraint */
  marginalFeasible: number;
  /** marginalFeasible - |F| */
  eliminationImpact: number;
  /** eliminationImpact / |C| * 100 */
  eliminationPct: number;
  rank: number;
  /** IDs of tracks that are in F(K\Ki) but NOT in F — i.e., tracks this constraint removes */
  eliminatedIds: Set<string>;
};

type InteractionPair = {
  ki: EliminationRow;
  kj: EliminationRow;
  /** |F(K \ {Ki, Kj})| */
  combinedMarginal: number;
  combinedImpact: number;
  /** combinedImpact - (ki.eliminationImpact + kj.eliminationImpact) — positive = interaction */
  interactionGain: number;
  /** True if interaction gain is non-trivially positive (> 5% of |C|) */
  isNonAdditive: boolean;
};

type RelaxResult = {
  relaxation: Relaxation;
  feasibleCount: number;
  delta: number;
};

type SensitivityResult = {
  def: ConstraintDef;
  relaxResults: RelaxResult[];
};

type ExemplarRecord = {
  result: AnalysisResult;
  tcv: TCV;
  barelySatisfied: string[];
  robustlyPassed: string[];
  nearestExcludedId: string | null;
  nearestExcludedPrimaryFailure: string | null;
};

type DiagnosticState = {
  // ── 0. Catalog + IR ──────────────────────────────────────────────────
  catalog: AnalysisResult[];
  activeConstraints: ConstraintDef[];
  tcvMap: Record<string, TCV>;

  // ── 1. Feasible Set ───────────────────────────────────────────────────
  feasibleCount: number;
  totalCatalog: number;
  survivalRate: number; // 0–100
  feasibleIds: Set<string>;

  // ── 2. Elimination Table ──────────────────────────────────────────────
  elimination: EliminationRow[];

  // ── 3. Bottleneck ─────────────────────────────────────────────────────
  primaryBottleneck: EliminationRow | null;
  secondaryBottleneck: EliminationRow | null;

  // ── 4. Interaction Signals ────────────────────────────────────────────
  interactions: InteractionPair[];

  // ── 5. Sensitivity ────────────────────────────────────────────────────
  sensitivity: SensitivityResult[];

  // ── 6. Exemplars ──────────────────────────────────────────────────────
  exemplars: ExemplarRecord[];

  // ── Extra: arc overlay ────────────────────────────────────────────────
  sceneUnitCurve: number[] | null;
  candidateCurves: number[][];

  // ── Extra: over-constraint flag ───────────────────────────────────────
  overConstrained: boolean;
};

function arcDist(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((s, v, i) => s + (v - (b[i] ?? 0)) ** 2, 0));
}

function cleanTitle(raw: string): string {
  let t = raw.replace(/^[0-9a-f]{6,}_/i, '').replace(/_/g, ' ')
    .replace(/\.(mp3|wav|flac|aiff?)$/i, '')
    .replace(/\b(Official\s+Video|Official\s+Audio|Lyric\s+Video|HD|HQ|4K)\b/gi, '')
    .replace(/\s{2,}/g, ' ').trim();
  if (t.includes(' - ')) t = t.slice(t.indexOf(' - ') + 3).trim();
  return t || raw;
}

/** Core computation — builds TCV for every track, then derives all outputs. */
function computeDiagnostic(
  catalog: AnalysisResult[],
  arc: SceneArc | null,
): DiagnosticState {
  const totalCatalog = catalog.length;
  const activeConstraints = CONSTRAINT_DEFS.filter(d => d.relevant(arc));

  // ── 0. Build TCV for every track ─────────────────────────────────────────
  const tcvMap: Record<string, TCV> = {};
  for (const r of catalog) {
    const evals: Record<string, ConstraintEval> = {};
    let vcount = 0;
    const failures: string[] = [];
    for (const def of activeConstraints) {
      const pass = def.test(r);
      const margin = pass ? def.margin(r) : null;
      evals[def.id] = { id: def.id, pass, margin };
      if (!pass) { vcount++; failures.push(def.id); }
    }
    tcvMap[r.track.id] = {
      trackId: r.track.id,
      evals,
      feasible: vcount === 0,
      failures, // will be re-ordered by elimination rank after step 2
      violationCount: vcount,
    };
  }

  // ── 1. Feasible Set ──────────────────────────────────────────────────────
  const feasibleIds = new Set(catalog.filter(r => tcvMap[r.track.id].feasible).map(r => r.track.id));
  const feasibleCount = feasibleIds.size;
  const survivalRate = totalCatalog > 0 ? (feasibleCount / totalCatalog) * 100 : 0;

  // ── 2. Elimination Attribution ───────────────────────────────────────────
  const elimination: EliminationRow[] = activeConstraints.map(def => {
    // F(K \ {Ki}): feasible set without this constraint
    const marginalSet = catalog.filter(r =>
      activeConstraints.every(c => c.id === def.id || tcvMap[r.track.id].evals[c.id].pass)
    );
    const marginalFeasible = marginalSet.length;
    const eliminationImpact = marginalFeasible - feasibleCount;
    const eliminationPct = totalCatalog > 0 ? (eliminationImpact / totalCatalog) * 100 : 0;
    // Eliminated IDs = in marginal but not in F (i.e., the ones this constraint gates out)
    const eliminatedIds = new Set(marginalSet.filter(r => !feasibleIds.has(r.track.id)).map(r => r.track.id));
    return { def, marginalFeasible, eliminationImpact, eliminationPct, rank: 0, eliminatedIds };
  });
  elimination.sort((a, b) => b.eliminationImpact - a.eliminationImpact);
  elimination.forEach((row, i) => { row.rank = i + 1; });

  // Re-order TCV failure lists by elimination rank
  const rankOrder = Object.fromEntries(elimination.map((r, i) => [r.def.id, i]));
  for (const tcv of Object.values(tcvMap)) {
    tcv.failures.sort((a, b) => (rankOrder[a] ?? 99) - (rankOrder[b] ?? 99));
  }

  // ── 3. Bottleneck ────────────────────────────────────────────────────────
  const primaryBottleneck   = elimination[0] ?? null;
  const secondaryBottleneck = elimination[1] ?? null;

  // ── 4. Interaction Signals (top-5 pairs) ────────────────────────────────
  const topConstraints = elimination.slice(0, 5);
  const interactions: InteractionPair[] = [];
  for (let i = 0; i < topConstraints.length; i++) {
    for (let j = i + 1; j < topConstraints.length; j++) {
      const ki = topConstraints[i], kj = topConstraints[j];
      const combined = catalog.filter(r =>
        activeConstraints.every(c =>
          c.id === ki.def.id || c.id === kj.def.id ||
          tcvMap[r.track.id].evals[c.id].pass
        )
      ).length;
      const combinedImpact = combined - feasibleCount;
      const interactionGain = combinedImpact - (ki.eliminationImpact + kj.eliminationImpact);
      interactions.push({
        ki, kj, combinedMarginal: combined, combinedImpact, interactionGain,
        isNonAdditive: interactionGain > Math.max(2, totalCatalog * 0.04),
      });
    }
  }
  // Surface only non-additive pairs, sorted by interaction gain
  interactions.sort((a, b) => b.interactionGain - a.interactionGain);

  // ── 5. Sensitivity Analysis (top-5 constraints) ─────────────────────────
  const sensitivity: SensitivityResult[] = elimination.slice(0, 5).map(row => {
    const relaxResults: RelaxResult[] = row.def.relaxations.map(rel => {
      const newFeasible = catalog.filter(r =>
        activeConstraints.every(c =>
          c.id === row.def.id ? rel.test(r) : tcvMap[r.track.id].evals[c.id].pass
        )
      ).length;
      return { relaxation: rel, feasibleCount: newFeasible, delta: newFeasible - feasibleCount };
    });
    return { def: row.def, relaxResults };
  });

  // ── 6. Exemplar Set ─────────────────────────────────────────────────────
  const feasibleList = catalog
    .filter(r => feasibleIds.has(r.track.id))
    .sort((a, b) => {
      const sa = a.confidenceScore.arcMatch?.combinedScore ?? a.confidenceScore.score;
      const sb = b.confidenceScore.arcMatch?.combinedScore ?? b.confidenceScore.score;
      return sb - sa;
    })
    .slice(0, 8);

  const nonFeasibleList = catalog.filter(r => !feasibleIds.has(r.track.id));

  const exemplars: ExemplarRecord[] = feasibleList.map(r => {
    const tcv = tcvMap[r.track.id];
    const barelySatisfied: string[] = [];
    const robustlyPassed: string[] = [];
    for (const def of activeConstraints) {
      const ev = tcv.evals[def.id];
      if (!ev.pass) continue;
      if (ev.margin !== null) {
        if (ev.margin < 0.22) barelySatisfied.push(def.label);
        else if (ev.margin > 0.60) robustlyPassed.push(def.label);
      }
    }

    // Nearest excluded neighbor (by arc distance) → report its primary failure
    let nearestExcludedId: string | null = null;
    let nearestExcludedPrimaryFailure: string | null = null;
    const myCurve = r.confidenceScore.songArcCurve;
    if (myCurve) {
      let minDist = Infinity;
      for (const nf of nonFeasibleList) {
        const nfCurve = nf.confidenceScore.songArcCurve;
        if (!nfCurve) continue;
        const d = arcDist(myCurve, nfCurve);
        if (d < minDist) {
          minDist = d;
          nearestExcludedId = nf.track.id;
          const nfTcv = tcvMap[nf.track.id];
          const primaryFailId = nfTcv.failures[0] ?? null;
          nearestExcludedPrimaryFailure = primaryFailId
            ? (activeConstraints.find(c => c.id === primaryFailId)?.label ?? null)
            : null;
        }
      }
    }

    return { result: r, tcv, barelySatisfied, robustlyPassed, nearestExcludedId, nearestExcludedPrimaryFailure };
  });

  // Arc overlay data
  const sceneUnitCurve = arc
    ? [arc.opening / 100, arc.heldBreath / 100, arc.turn / 100, arc.release / 100]
    : null;
  const candidateCurves = catalog
    .filter(r => r.confidenceScore.songArcCurve?.length === 4)
    .sort((a, b) => {
      const sa = a.confidenceScore.arcMatch?.combinedScore ?? a.confidenceScore.score;
      const sb = b.confidenceScore.arcMatch?.combinedScore ?? b.confidenceScore.score;
      return sb - sa;
    })
    .slice(0, 50)
    .map(r => r.confidenceScore.songArcCurve!);

  return {
    catalog, activeConstraints, tcvMap,
    feasibleCount, totalCatalog, survivalRate, feasibleIds,
    elimination, primaryBottleneck, secondaryBottleneck,
    interactions, sensitivity, exemplars,
    sceneUnitCurve, candidateCurves,
    overConstrained: survivalRate < 1.5 || feasibleCount === 0,
  };
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export type ConstraintDiagnosticProps = {
  results: AnalysisResult[];
  sceneArc: SceneArc | null;
  /** Parent uses this to dim non-matching rows in the track list */
  onHighlight?: (ids: Set<string> | null) => void;
};

export function ConstraintDiagnosticEngine({ results, sceneArc, onHighlight }: ConstraintDiagnosticProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const diag = useMemo(() => computeDiagnostic(results, sceneArc), [results, sceneArc]);

  if (results.length === 0 || diag.activeConstraints.length === 0) return null;

  function selectConstraint(id: string, ids: Set<string>) {
    if (activeId === id) { setActiveId(null); onHighlight?.(null); }
    else                 { setActiveId(id);   onHighlight?.(ids); }
  }

  const { feasibleCount: F, totalCatalog: C, survivalRate } = diag;

  return (
    <div style={{ fontFamily: SANS, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>

      {/* ═══ SECTION 1: Feasible Set Summary ════════════════════════════════ */}
      <div style={{ borderRadius: 14, background: C.surface, border: `1px solid ${C.hairline}`, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.amberDim, marginBottom: 4 }}>
              Constraint Diagnostic Engine
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 'clamp(18px,2.2vw,26px)', color: C.silver, letterSpacing: '-0.015em', lineHeight: 1.1 }}>
              |C| = {C.toLocaleString()} &nbsp;·&nbsp; |K| = {diag.activeConstraints.length} &nbsp;·&nbsp;{' '}
              <span style={{ color: survivalRate < 2 ? C.red : survivalRate < 8 ? C.amber : C.green }}>
                |F| = {F}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.lavenderDim, marginTop: 4 }}>
              Survival rate: {survivalRate < 1 ? survivalRate.toFixed(2) : survivalRate.toFixed(1)}%
              {' '}of catalog reaches feasible set
            </div>
          </div>

          {/* Arc cloud — compact */}
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 220, flexShrink: 0, display: 'block' }}>
            {PHASE_F.slice(1, 3).map((f, i) => (
              <line key={i} x1={svgX(f)} y1={PT} x2={svgX(f)} y2={PT + PH} stroke={C.hairline} strokeWidth="1" />
            ))}
            {PHASE_F.map((f, i) => (
              <text key={i} x={svgX(f)} y={PT - 4}
                textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}
                fontSize="7" fill={C.lavenderDim} fontFamily={SANS}>
                {PHASE_LBL[i][0]}
              </text>
            ))}
            {diag.candidateCurves.map((curve, i) => (
              <path key={i}
                d={catmullRomPath(PHASE_F.map((f, j) => [svgX(f), svgY(curve[j] ?? 0)] as [number, number]))}
                fill="none" stroke="rgba(155,147,196,0.08)" strokeWidth="1.2" />
            ))}
            {diag.sceneUnitCurve && (() => {
              const pts: [number, number][] = PHASE_F.map((f, j) => [svgX(f), svgY(diag.sceneUnitCurve![j])]);
              return <>
                <path d={catmullRomPath(pts)} fill="none" stroke="rgba(219,39,119,0.20)" strokeWidth="5" />
                <path d={catmullRomPath(pts)} fill="none" stroke="#DB2777" strokeWidth="2" strokeDasharray="4,3" />
              </>;
            })()}
          </svg>
        </div>

        {/* Over-constraint alert */}
        {diag.overConstrained && (
          <div style={{ padding: '10px 18px', background: 'rgba(239,68,68,0.06)', borderBottom: `1px solid rgba(239,68,68,0.14)` }}>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.red, marginBottom: 3 }}>
              Over-constrained brief
            </div>
            <div style={{ fontSize: 12, color: C.lavender, lineHeight: 1.6 }}>
              {F === 0
                ? `No track in the catalog of ${C} satisfies all ${diag.activeConstraints.length} active constraints simultaneously. The constraint set produces an empty feasible region.`
                : `Only ${F} of ${C} tracks (${survivalRate.toFixed(1)}%) survive all constraints. The constraint set has produced a near-empty feasible region. See bottleneck analysis below.`}
            </div>
          </div>
        )}
      </div>

      {/* ═══ SECTION 2: Constraint Elimination Table ════════════════════════ */}
      <div style={{ borderRadius: 14, background: C.surface, border: `1px solid ${C.hairline}`, overflow: 'hidden' }}>
        <SectionHead label="Constraint Elimination" sub="ranked by |F(K\Ki)| − |F|" mono />
        <div style={{
          display: 'grid', gridTemplateColumns: '22px 14px 1fr 74px 74px 58px',
          gap: 6, padding: '6px 18px 5px', borderBottom: `1px solid ${C.hairline}`,
        }}>
          {['#', 'type', 'Constraint Ki', '|F(K\\Ki)|', 'Δ Added', '% C'].map(h => (
            <div key={h} style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.lavenderDim, textAlign: h === '#' || h === 'type' ? 'center' : h === 'Constraint Ki' ? 'left' : 'right' }}>{h}</div>
          ))}
        </div>
        {diag.elimination.map(row => {
          const active = activeId === `elim_${row.def.id}`;
          return (
            <button
              key={row.def.id} type="button"
              onClick={() => selectConstraint(`elim_${row.def.id}`, row.eliminatedIds)}
              style={{
                display: 'grid', gridTemplateColumns: '22px 14px 1fr 74px 74px 58px',
                gap: 6, padding: '8px 18px', width: '100%', textAlign: 'left',
                background: active ? C.amberFaint : 'transparent',
                border: 'none', borderLeft: `2px solid ${active ? C.amber : 'transparent'}`,
                borderBottom: `1px solid ${C.hairline}`, cursor: 'pointer', transition: 'background .12s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget.style.background = C.hover); }}
              onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent'); }}
            >
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.lavenderDim, textAlign: 'center', paddingTop: 1 }}>{row.rank}</div>
              <div title={row.def.type}>
                <TypeBadge type={row.def.type} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: active ? C.amber : C.silver }}>{row.def.label}</div>
                {row.rank === 1 && <div style={{ fontSize: 9, color: C.red, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 1 }}>primary bottleneck</div>}
              </div>
              <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12, color: C.silverDim, paddingTop: 1 }}>{row.marginalFeasible.toLocaleString()}</div>
              <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.amber, paddingTop: 1 }}>+{row.eliminationImpact.toLocaleString()}</div>
              <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12, color: C.lavender, paddingTop: 1 }}>{row.eliminationPct.toFixed(1)}%</div>
            </button>
          );
        })}
      </div>

      {/* ═══ SECTION 3: Bottleneck Analysis ════════════════════════════════ */}
      {diag.primaryBottleneck && (
        <div style={{ borderRadius: 14, background: C.surface, border: `1px solid ${C.hairline}`, overflow: 'hidden' }}>
          <SectionHead label="Bottleneck Analysis" sub="argmax elimination impact" mono />
          <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <BottleneckCard row={diag.primaryBottleneck} feasibleCount={F} isPrimary />
            {diag.secondaryBottleneck && <BottleneckCard row={diag.secondaryBottleneck} feasibleCount={F} />}
          </div>
        </div>
      )}

      {/* ═══ SECTION 4: Interaction Collapse Signals ════════════════════════ */}
      {diag.interactions.some(i => i.isNonAdditive) && (
        <div style={{ borderRadius: 14, background: C.surface, border: `1px solid ${C.hairline}`, overflow: 'hidden' }}>
          <SectionHead label="Interaction Collapse Signals" sub="constraint pairs with non-additive elimination" mono />
          <div style={{ padding: '8px 0 4px' }}>
            {diag.interactions.filter(i => i.isNonAdditive).slice(0, 3).map((pair, idx) => (
              <InteractionRow key={idx} pair={pair} totalCatalog={C} feasibleCount={F} />
            ))}
            {diag.interactions.every(i => !i.isNonAdditive) && (
              <div style={{ padding: '10px 18px', fontSize: 12, color: C.lavenderDim }}>
                No significant constraint interactions detected. Top-{diag.elimination.slice(0, 5).length} constraints operate approximately independently.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ SECTION 5: Sensitivity Analysis ═══════════════════════════════ */}
      <div style={{ borderRadius: 14, background: C.surface, border: `1px solid ${C.hairline}`, overflow: 'hidden' }}>
        <SectionHead label="Sensitivity Analysis" sub="ΔF per constraint relaxation" mono />
        <div style={{ padding: '4px 0 2px' }}>
          {diag.sensitivity.map(row => (
            <SensitivityRow key={row.def.id} row={row} baseCount={F} totalCatalog={C} />
          ))}
        </div>
      </div>

      {/* ═══ SECTION 6: Exemplar Set ════════════════════════════════════════ */}
      {diag.exemplars.length > 0 && (
        <div style={{ borderRadius: 14, background: C.surface, border: `1px solid ${C.hairline}`, overflow: 'hidden' }}>
          <SectionHead
            label={`Exemplar Set — ${diag.exemplars.length} of ${F} feasible`}
            sub="TCV margin annotations + nearest exclusion geometry"
            mono
          />
          <div style={{ padding: '4px 0 4px' }}>
            {diag.exemplars.map((ex, i) => (
              <ExemplarRow key={ex.result.track.id} ex={ex} rank={i + 1} activeConstraints={diag.activeConstraints} />
            ))}
          </div>
        </div>
      )}

      {/* Active filter notice */}
      {activeId && (
        <div style={{
          borderRadius: 9, padding: '9px 14px',
          background: C.amberFaint, border: `1px solid rgba(245,181,68,0.20)`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12, color: C.amber,
        }}>
          <span>Tracks eliminated by this constraint are highlighted in the list below.</span>
          <button type="button" onClick={() => { setActiveId(null); onHighlight?.(null); }}
            style={{ background: 'none', border: 'none', color: C.amberDim, cursor: 'pointer', padding: 0, fontSize: 12 }}>
            Clear ×
          </button>
        </div>
      )}
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionHead({ label, sub, mono }: { label: string; sub?: string; mono?: boolean }) {
  return (
    <div style={{ padding: '10px 18px 8px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: C.amberDim }}>{label}</span>
      {sub && <span style={{ fontSize: 10, color: C.lavenderDim, fontFamily: mono ? MONO : SANS }}>{sub}</span>}
    </div>
  );
}

const TYPE_ABBR: Record<ConstraintType, string> = {
  binary_filter:    'B',
  threshold_filter: 'T',
  temporal_alignment:'A',
  curve_match:      'C',
  fuzzy_window:     'F',
};
const TYPE_COLOR: Record<ConstraintType, string> = {
  binary_filter:    '#7B70B2',
  threshold_filter: '#F5B544',
  temporal_alignment:'#DB2777',
  curve_match:      '#2DD4BF',
  fuzzy_window:     '#22C55E',
};

function TypeBadge({ type }: { type: ConstraintType }) {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `${TYPE_COLOR[type]}22`, fontSize: 8, fontWeight: 700,
      color: TYPE_COLOR[type], fontFamily: MONO, flexShrink: 0,
    }}>
      {TYPE_ABBR[type]}
    </div>
  );
}

function BottleneckCard({ row, feasibleCount, isPrimary }: { row: EliminationRow; feasibleCount: number; isPrimary?: boolean }) {
  return (
    <div style={{
      padding: '11px 14px', borderRadius: 10,
      background: isPrimary ? C.redFaint : C.orangeFaint,
      border: `1px solid ${isPrimary ? 'rgba(239,68,68,0.18)' : 'rgba(249,115,22,0.16)'}`,
    }}>
      <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: isPrimary ? C.red : C.orange, marginBottom: 5 }}>
        {isPrimary ? 'Primary bottleneck' : 'Secondary bottleneck'}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.silver, marginBottom: 6 }}>{row.def.label}</div>
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.lavender, lineHeight: 1.8 }}>
        <span>|F| = {feasibleCount}</span>
        <span style={{ color: C.lavenderDim }}> → </span>
        <span style={{ color: C.amber }}>|F(K\Ki)| = {row.marginalFeasible}</span>
        <span style={{ color: C.lavenderDim }}> &nbsp;(+{row.eliminationImpact} tracks, {row.eliminationPct.toFixed(1)}% of |C|)</span>
      </div>
    </div>
  );
}

function InteractionRow({ pair, totalCatalog, feasibleCount }: { pair: InteractionPair; totalCatalog: number; feasibleCount: number }) {
  const expected = pair.ki.eliminationImpact + pair.kj.eliminationImpact;
  return (
    <div style={{ padding: '10px 18px', borderBottom: `1px solid ${C.hairline}` }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.orange }}>{pair.ki.def.label}</span>
        <span style={{ color: C.lavenderDim, fontSize: 11 }}>×</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.orange }}>{pair.kj.def.label}</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.lavender, lineHeight: 1.8 }}>
        <div>Ki alone: +{pair.ki.eliminationImpact} &nbsp;·&nbsp; Kj alone: +{pair.kj.eliminationImpact} &nbsp;·&nbsp; Expected: +{expected}</div>
        <div>Combined removal: +<span style={{ color: C.orange }}>{pair.combinedImpact}</span> &nbsp;·&nbsp; Interaction gain: <span style={{ color: C.orange }}>+{pair.interactionGain}</span> ({((pair.interactionGain / totalCatalog) * 100).toFixed(1)}% of |C|)</div>
      </div>
      <div style={{ fontSize: 11, color: C.orange, marginTop: 5, lineHeight: 1.5 }}>
        Non-additive collapse: relaxing either constraint alone provides less relief than their combined removal suggests.
        {pair.combinedImpact > feasibleCount + expected ? ' Removing both is required to meaningfully expand the feasible set.' : ''}
      </div>
    </div>
  );
}

function SensitivityRow({ row, baseCount, totalCatalog }: { row: SensitivityResult; baseCount: number; totalCatalog: number }) {
  return (
    <div style={{ padding: '10px 18px', borderBottom: `1px solid ${C.hairline}` }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.silver, marginBottom: 6 }}>{row.def.label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {/* base */}
        <SensitivityCell label="Strict (current)" count={baseCount} total={totalCatalog} delta={0} isBase />
        {row.relaxResults.map(r => (
          <SensitivityCell
            key={r.relaxation.label}
            label={r.relaxation.label}
            count={r.feasibleCount}
            total={totalCatalog}
            delta={r.delta}
            mutation={r.relaxation.mutation}
          />
        ))}
      </div>
    </div>
  );
}

function SensitivityCell({ label, count, total, delta, isBase, mutation }: {
  label: string; count: number; total: number; delta: number; isBase?: boolean; mutation?: string;
}) {
  const survivorPct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
  return (
    <div title={mutation}
      style={{
        padding: '7px 10px', borderRadius: 8, flexShrink: 0,
        background: isBase ? C.lavenderFaint : C.greenFaint,
        border: `1px solid ${isBase ? C.hairline : 'rgba(34,197,94,0.16)'}`,
        minWidth: 90,
      }}>
      <div style={{ fontSize: 9, letterSpacing: '0.10em', textTransform: 'uppercase', color: isBase ? C.lavenderDim : C.green, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: isBase ? C.silver : C.green, lineHeight: 1 }}>
        {count.toLocaleString()}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: isBase ? C.lavenderDim : C.green, marginTop: 3 }}>
        {isBase ? `${survivorPct}% of |C|` : `+${delta} · ${survivorPct}% of |C|`}
      </div>
    </div>
  );
}

function ExemplarRow({ ex, rank, activeConstraints }: { ex: ExemplarRecord; rank: number; activeConstraints: ConstraintDef[] }) {
  const title = cleanTitle(ex.result.track.title);
  const score = ex.result.confidenceScore.arcMatch?.combinedScore ?? ex.result.confidenceScore.score;

  return (
    <div style={{ padding: '10px 18px', borderBottom: `1px solid ${C.hairline}` }}
      onMouseEnter={e => { (e.currentTarget.style.background = C.hover); }}
      onMouseLeave={e => { (e.currentTarget.style.background = 'transparent'); }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.lavenderDim, minWidth: 16, textAlign: 'right', flexShrink: 0 }}>{rank}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.silver, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {title}
        </span>
        {ex.result.track.artistName && (
          <span style={{ fontSize: 11, color: C.lavenderDim, flexShrink: 0 }}>{ex.result.track.artistName}</span>
        )}
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.amber, flexShrink: 0 }}>
          {Math.round(score)}
        </span>
      </div>

      {/* TCV margin grid */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 24 }}>
        {activeConstraints.map(def => {
          const ev = ex.tcv.evals[def.id];
          if (!ev) return null;
          const barely = ev.margin !== null && ev.margin < 0.22;
          const binary = def.type === 'binary_filter';
          return (
            <div key={def.id}
              title={`${def.label} (${def.type}): margin ${ev.margin !== null ? (ev.margin * 100).toFixed(0) + '%' : binary ? 'binary' : 'n/a'}`}
              style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                background: barely ? 'rgba(249,115,22,0.10)' : binary ? C.lavenderFaint : C.greenFaint,
                border: `1px solid ${barely ? 'rgba(249,115,22,0.22)' : barely ? C.hairline : 'rgba(34,197,94,0.14)'}`,
                color: barely ? C.orange : C.lavenderDim,
                fontFamily: MONO,
              }}>
              {barely ? '⚡ ' : ''}{def.label}
              {ev.margin !== null && !binary && (
                <span style={{ opacity: 0.6, marginLeft: 4 }}>{(ev.margin * 100).toFixed(0)}%</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Nearest exclusion */}
      {ex.nearestExcludedPrimaryFailure && (
        <div style={{ marginTop: 5, marginLeft: 24, fontSize: 11, color: C.lavenderDim, lineHeight: 1.5 }}>
          Nearest excluded neighbor fails: <span style={{ color: C.red }}>{ex.nearestExcludedPrimaryFailure}</span>
        </div>
      )}
      {ex.barelySatisfied.length > 0 && (
        <div style={{ marginTop: 3, marginLeft: 24, fontSize: 11, color: C.orange }}>
          Barely satisfies {ex.barelySatisfied.length === 1 ? ex.barelySatisfied[0] : `${ex.barelySatisfied.length} constraints`} — vulnerable under brief revision
        </div>
      )}
    </div>
  );
}
