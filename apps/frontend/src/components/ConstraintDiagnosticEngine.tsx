/**
 * SyncVision Constraint Diagnostic Engine — SCDE v3
 *
 * CORE PRINCIPLE: All outputs are fully reproducible from (Catalog C, Brief B).
 * No heuristic inference. Every claim traces to TCV evaluations or elimination deltas.
 *
 * FORMAL OBJECTS:
 *   C  — full catalog of AnalysisResult
 *   K  — active constraint set derived deterministically from SceneArc
 *   F  — feasible set: intersection of all hard constraints over C
 *   TCV— Track Constraint Vector: per-constraint pass/fail + margin + input trace
 *
 * OUTPUT HIERARCHY (strict, non-reorderable):
 *   1. Feasibility Summary
 *   2. CIFE Collapse Analysis
 *   3. Primary Bottleneck Constraint
 *   4. Constraint Elimination Ranking
 *   5. Interaction Collapse Graph
 *   6. Brief Structural Classification
 *   7. Sensitivity Surface
 *   8. Exemplar Set (TCV-grounded)
 *
 * BANNED: confidence scores, vague labels, opaque rankings, any output not
 *         derivable from TCV or elimination computations.
 */

import { useMemo, useState } from 'react';
import type { AnalysisResult, SceneArc } from '../utils/apiClient';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:       '#0D0B1E',
  panel:    'rgba(13,9,35,0.80)',
  raised:   'rgba(20,12,48,0.90)',
  hairline: 'rgba(123,112,178,0.16)',
  hairlineMid: 'rgba(123,112,178,0.28)',
  silver:   '#F4F2FA',
  silverDim:'rgba(244,242,250,0.65)',
  lavender: '#9B93C4',
  lavDim:   'rgba(155,147,196,0.55)',
  lavFaint: 'rgba(155,147,196,0.08)',
  magenta:  '#DB2777',
  magFaint: 'rgba(219,39,119,0.09)',
  amber:    '#F5B544',
  ambDim:   'rgba(245,181,68,0.55)',
  ambFaint: 'rgba(245,181,68,0.08)',
  good:     '#4CAF82',
  goodFaint:'rgba(76,175,130,0.09)',
  bad:      '#E85A5A',
  badFaint: 'rgba(232,90,90,0.09)',
  teal:     '#38BDF8',
  orange:   '#FB923C',
  mono:     '"JetBrains Mono", monospace',
  serif:    '"Instrument Serif", Georgia, serif',
  sans:     '"Manrope", system-ui, sans-serif',
};

// ─── Constraint type system ─────────────────────────────────────────────────────
type ConstraintType =
  | 'binary_filter'
  | 'threshold_filter'
  | 'temporal_alignment'
  | 'curve_match'
  | 'fuzzy_window'
  | 'structural_constraint';

const TYPE_META: Record<ConstraintType, { abbr: string; color: string; desc: string }> = {
  binary_filter:         { abbr: 'B', color: '#9B93C4', desc: 'Binary filter'       },
  threshold_filter:      { abbr: 'T', color: '#F5B544', desc: 'Threshold filter'    },
  temporal_alignment:    { abbr: 'A', color: '#4CAF82', desc: 'Temporal alignment'  },
  curve_match:           { abbr: 'C', color: '#DB2777', desc: 'Curve match'         },
  fuzzy_window:          { abbr: 'F', color: '#38BDF8', desc: 'Fuzzy window'        },
  structural_constraint: { abbr: 'S', color: '#FB923C', desc: 'Structural'          },
};

// ─── Data types ─────────────────────────────────────────────────────────────────
type Relaxation = {
  label: string;
  description: string;
  test: (r: AnalysisResult) => boolean;
};

type ConstraintDef = {
  id: string;
  version: string;           // semantic version — pinned for reproducibility
  label: string;
  type: ConstraintType;
  inputFeatures: string[];   // explicit raw fields read — required for trace
  test:   (r: AnalysisResult) => boolean;
  score:  (r: AnalysisResult) => number;   // 0–1 normalized evaluation strength
  margin: (r: AnalysisResult) => number | null; // signed distance from boundary; null = binary
  relaxations: Relaxation[];
  relevant: (arc: SceneArc | null) => boolean;
};

// Track Constraint Vector — the intermediate representation
type TCVEval = {
  constraintId: string;
  constraintVersion: string;
  status: 'pass' | 'fail';
  score: number;
  margin: number | null;
  inputValues: Record<string, unknown>; // raw inputs captured for replay
};

type TCV = {
  trackId: string;
  evals: Record<string, TCVEval>;
  feasible: boolean;
  failures: string[];        // constraintIds, ordered by elimination rank (post step-3)
  violationCount: number;
};

type EliminationRow = {
  def: ConstraintDef;
  marginalFeasible: number;  // |F(K \ Ki)|
  eliminationImpact: number; // |F(K \ Ki)| − |F|
  eliminationPct: number;
  rank: number;
  eliminatedIds: Set<string>;
};

type InteractionPair = {
  ki: EliminationRow;
  kj: EliminationRow;
  combinedMarginal: number;  // |F(K \ {Ki, Kj})|
  combinedImpact: number;
  interactionGain: number;   // combinedImpact − (ki.impact + kj.impact); positive = superadditive
  isNonAdditive: boolean;
};

// Constraint-Induced Feasibility Entropy
type CIFEResult = {
  baselineEntropy: number;        // arc diversity of full catalog [0–1]
  postConstraintEntropy: number;  // arc diversity of feasible set [0–1]
  entropyReduction: number;       // fraction 0–1
  entropyReductionPct: number;    // 0–100
  perConstraint: Array<{
    id: string; label: string;
    contribution: number;         // entropy units attributed to this constraint
    contributionPct: number;      // share of total entropy reduction
  }>;
};

type BriefClassificationType =
  | 'well-posed'
  | 'over-constrained'
  | 'contradictory'
  | 'degenerate'
  | 'under-specified';

const CLASSIFICATION_META: Record<BriefClassificationType, { color: string; label: string }> = {
  'well-posed':      { color: C.good,    label: 'Well-Posed'       },
  'over-constrained':{ color: C.amber,   label: 'Over-Constrained' },
  'contradictory':   { color: C.bad,     label: 'Contradictory'    },
  'degenerate':      { color: C.orange,  label: 'Degenerate'       },
  'under-specified': { color: C.lavender,label: 'Under-Specified'  },
};

type BriefClassification = {
  type: BriefClassificationType;
  rationale: string;
  metrics: {
    feasibleCount: number;
    survivalRate: number;
    entropyReductionPct: number;
    interactionDensity: number;
  };
};

type SensitivityRow = {
  def: ConstraintDef;
  relaxations: Array<{
    label: string;
    description: string;
    feasibleCount: number;
    delta: number;
    deltaPct: number;
  }>;
};

type ExemplarRecord = {
  result: AnalysisResult;
  tcv: TCV;
  arcScore: number;
  margins: Array<{ constraintId: string; label: string; margin: number | null; status: 'pass' | 'fail' }>;
  nearestExcluded: {
    result: AnalysisResult;
    arcDistance: number;
    failingConstraintId: string;
    failingLabel: string;
  } | null;
};

type DiagnosticState = {
  catalog: AnalysisResult[];
  activeConstraints: ConstraintDef[];
  tcvMap: Record<string, TCV>;
  feasibleCount: number;
  totalCatalog: number;
  survivalRate: number;
  feasibleIds: Set<string>;
  cife: CIFEResult;
  elimination: EliminationRow[];
  primaryBottleneck: EliminationRow | null;
  secondaryBottleneck: EliminationRow | null;
  interactions: InteractionPair[];
  briefClassification: BriefClassification;
  sensitivity: SensitivityRow[];
  exemplars: ExemplarRecord[];
  sceneUnitCurve: number[] | null;
  candidateCurves: number[][];
  overConstrained: boolean;
};

// ─── Constraint registry ────────────────────────────────────────────────────────
// Every constraint is pure, versioned, and input-feature explicit.
// Evaluation is fully deterministic from raw track data.
const ALL_CONSTRAINTS: ConstraintDef[] = [
  {
    id: 'peak_at_or_after_turn',
    version: '1.0.0',
    label: 'Peak At or After Turn',
    type: 'temporal_alignment',
    inputFeatures: ['songArcCurve[1]', 'songArcCurve[2]'],
    test: r => {
      const c = r.confidenceScore.songArcCurve;
      return c != null && c.length === 4 && c[2] >= c[1] - 0.03;
    },
    score: r => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 4) return 0;
      return Math.max(0, Math.min(1, (c[2] - c[1] + 0.03) / 0.4 + 0.5));
    },
    margin: r => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 4) return null;
      return parseFloat((c[2] - (c[1] - 0.03)).toFixed(3));
    },
    relaxations: [
      {
        label: 'Moderate',
        description: 'Peak within 0.10 of turn',
        test: r => { const c = r.confidenceScore.songArcCurve; return c != null && c.length === 4 && c[2] >= c[1] - 0.10; },
      },
      {
        label: 'Relaxed',
        description: 'Any post-opening peak',
        test: r => { const c = r.confidenceScore.songArcCurve; return c != null && c.length === 4 && c[2] >= c[0]; },
      },
    ],
    relevant: () => true,
  },
  {
    id: 'delayed_release',
    version: '1.0.0',
    label: 'Delayed Release',
    type: 'temporal_alignment',
    inputFeatures: ['songArcCurve[2]', 'songArcCurve[3]'],
    test: r => {
      const c = r.confidenceScore.songArcCurve;
      return c != null && c.length === 4 && c[2] >= 0.48 && c[3] < c[2] - 0.18;
    },
    score: r => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 4) return 0;
      const a = Math.max(0, Math.min(1, (c[2] - 0.48) / 0.3));
      const b = Math.max(0, Math.min(1, (c[2] - c[3] - 0.18) / 0.3));
      return (a + b) / 2;
    },
    margin: r => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 4) return null;
      return parseFloat(Math.min(c[2] - 0.48, c[2] - c[3] - 0.18).toFixed(3));
    },
    relaxations: [
      {
        label: 'Moderate',
        description: 'Turn ≥ 0.40, drop ≥ 0.12',
        test: r => { const c = r.confidenceScore.songArcCurve; return c != null && c.length === 4 && c[2] >= 0.40 && c[3] < c[2] - 0.12; },
      },
      {
        label: 'Relaxed',
        description: 'Any downward release',
        test: r => { const c = r.confidenceScore.songArcCurve; return c != null && c.length === 4 && c[3] < c[2]; },
      },
    ],
    relevant: arc => arc != null && arc.release < 60,
  },
  {
    id: 'restrained_opening',
    version: '1.0.0',
    label: 'Restrained Opening',
    type: 'threshold_filter',
    inputFeatures: ['songArcCurve[0]'],
    test: r => {
      const c = r.confidenceScore.songArcCurve;
      return c != null && c.length === 4 && c[0] <= 0.38;
    },
    score: r => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 4) return 0;
      return Math.max(0, Math.min(1, 1 - (c[0] - 0.38) / 0.5));
    },
    margin: r => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 4) return null;
      return parseFloat((0.38 - c[0]).toFixed(3));
    },
    relaxations: [
      {
        label: 'Moderate',
        description: 'Opening ≤ 0.50',
        test: r => { const c = r.confidenceScore.songArcCurve; return c != null && c.length === 4 && c[0] <= 0.50; },
      },
      {
        label: 'Relaxed',
        description: 'Opening ≤ 0.65',
        test: r => { const c = r.confidenceScore.songArcCurve; return c != null && c.length === 4 && c[0] <= 0.65; },
      },
    ],
    relevant: arc => arc != null && arc.opening < 50,
  },
  {
    id: 'sustained_tension',
    version: '1.0.0',
    label: 'Sustained Tension',
    type: 'threshold_filter',
    inputFeatures: ['songArcCurve[1]', 'songArcCurve[2]'],
    test: r => {
      const c = r.confidenceScore.songArcCurve;
      return c != null && c.length === 4 && c[1] >= 0.52 && c[2] >= 0.50;
    },
    score: r => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 4) return 0;
      const a = Math.max(0, Math.min(1, (c[1] - 0.52) / 0.3 + 0.5));
      const b = Math.max(0, Math.min(1, (c[2] - 0.50) / 0.3 + 0.5));
      return (a + b) / 2;
    },
    margin: r => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 4) return null;
      return parseFloat(Math.min(c[1] - 0.52, c[2] - 0.50).toFixed(3));
    },
    relaxations: [
      {
        label: 'Moderate',
        description: 'Held breath ≥ 0.42, turn ≥ 0.40',
        test: r => { const c = r.confidenceScore.songArcCurve; return c != null && c.length === 4 && c[1] >= 0.42 && c[2] >= 0.40; },
      },
      {
        label: 'Relaxed',
        description: 'Held breath ≥ 0.35',
        test: r => { const c = r.confidenceScore.songArcCurve; return c != null && c.length === 4 && c[1] >= 0.35; },
      },
    ],
    relevant: arc => arc != null && arc.heldBreath > 55,
  },
  {
    id: 'sustained_build',
    version: '1.0.0',
    label: 'Sustained Build',
    type: 'threshold_filter',
    inputFeatures: ['songArcCurve[0]', 'songArcCurve[1]'],
    test: r => {
      const c = r.confidenceScore.songArcCurve;
      return c != null && c.length === 4 && c[1] > c[0] + 0.14;
    },
    score: r => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 4) return 0;
      return Math.max(0, Math.min(1, (c[1] - c[0] - 0.14) / 0.4 + 0.5));
    },
    margin: r => {
      const c = r.confidenceScore.songArcCurve;
      if (!c || c.length < 4) return null;
      return parseFloat((c[1] - c[0] - 0.14).toFixed(3));
    },
    relaxations: [
      {
        label: 'Moderate',
        description: 'Build ≥ 0.08',
        test: r => { const c = r.confidenceScore.songArcCurve; return c != null && c.length === 4 && c[1] > c[0] + 0.08; },
      },
      {
        label: 'Relaxed',
        description: 'Any upward movement',
        test: r => { const c = r.confidenceScore.songArcCurve; return c != null && c.length === 4 && c[1] > c[0]; },
      },
    ],
    relevant: arc => arc != null && arc.heldBreath > arc.opening,
  },
  {
    id: 'arc_alignment',
    version: '1.0.0',
    label: 'Arc Alignment',
    type: 'curve_match',
    inputFeatures: ['arcMatch.combinedScore'],
    test: r => (r.confidenceScore.arcMatch?.combinedScore ?? 0) >= 70,
    score: r => Math.max(0, Math.min(1, (r.confidenceScore.arcMatch?.combinedScore ?? 0) / 100)),
    margin: r => {
      const s = r.confidenceScore.arcMatch?.combinedScore;
      return s == null ? null : parseFloat((s - 70).toFixed(1));
    },
    relaxations: [
      {
        label: 'Moderate',
        description: 'Arc score ≥ 55',
        test: r => (r.confidenceScore.arcMatch?.combinedScore ?? 0) >= 55,
      },
      {
        label: 'Relaxed',
        description: 'Arc score ≥ 40',
        test: r => (r.confidenceScore.arcMatch?.combinedScore ?? 0) >= 40,
      },
    ],
    relevant: arc => arc != null,
  },
  {
    id: 'minor_tonality',
    version: '1.0.0',
    label: 'Minor Tonality',
    type: 'binary_filter',
    inputFeatures: ['track.tonalCharacter'],
    test: r => /minor|dorian|phryg/i.test(r.track.tonalCharacter ?? ''),
    score: r => (/minor|dorian|phryg/i.test(r.track.tonalCharacter ?? '') ? 1 : 0),
    margin: () => null,
    relaxations: [
      {
        label: 'Moderate',
        description: 'Include modal/ambiguous tonalities',
        test: r => /minor|dorian|phryg|modal|ambig/i.test(r.track.tonalCharacter ?? ''),
      },
      {
        label: 'Relaxed',
        description: 'No tonality restriction',
        test: () => true,
      },
    ],
    relevant: arc => arc != null && arc.opening < 40,
  },
];

// ─── Computation helpers ────────────────────────────────────────────────────────
function captureInputValues(cd: ConstraintDef, r: AnalysisResult): Record<string, unknown> {
  const vals: Record<string, unknown> = {};
  const curve = r.confidenceScore.songArcCurve;
  for (const feat of cd.inputFeatures) {
    if (feat.startsWith('songArcCurve[') && curve) {
      const idx = parseInt(feat.slice(13, -1));
      vals[feat] = curve[idx] ?? null;
    } else if (feat === 'arcMatch.combinedScore') {
      vals[feat] = r.confidenceScore.arcMatch?.combinedScore ?? null;
    } else if (feat === 'track.tonalCharacter') {
      vals[feat] = r.track.tonalCharacter ?? null;
    }
  }
  return vals;
}

// Arc diversity = mean variance across 4 arc dimensions. Range ≈ 0–0.08.
function computeArcEntropy(tracks: AnalysisResult[]): number {
  const curves = tracks
    .map(t => t.confidenceScore.songArcCurve)
    .filter((c): c is number[] => c != null && c.length === 4);
  if (curves.length < 2) return 0;
  const dims = [0, 1, 2, 3].map(i => {
    const vals = curves.map(c => c[i]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
  });
  return dims.reduce((a, b) => a + b, 0) / 4;
}

function smoothPath(pts: Array<[number, number]>, tension = 0.35): string {
  if (pts.length < 2) return '';
  const d: string[] = [`M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
    d.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`);
  }
  return d.join(' ');
}

function curveToSvgPts(curve: number[], W: number, H: number, padX = 6, padY = 6): Array<[number, number]> {
  return curve.map((v, i) => [
    padX + (i / (curve.length - 1)) * (W - 2 * padX),
    H - padY - v * (H - 2 * padY),
  ]);
}

// ─── Core computation ───────────────────────────────────────────────────────────
function computeDiagnostic(
  catalog: AnalysisResult[],
  sceneArc: SceneArc | null,
): DiagnosticState {
  const activeConstraints = ALL_CONSTRAINTS.filter(cd => cd.relevant(sceneArc));

  // ── Step 1: Build TCV for every track ──
  const tcvMap: Record<string, TCV> = {};
  for (const r of catalog) {
    const evals: Record<string, TCVEval> = {};
    let violationCount = 0;
    for (const cd of activeConstraints) {
      const pass = cd.test(r);
      if (!pass) violationCount++;
      evals[cd.id] = {
        constraintId: cd.id,
        constraintVersion: cd.version,
        status: pass ? 'pass' : 'fail',
        score: cd.score(r),
        margin: cd.margin(r),
        inputValues: captureInputValues(cd, r),
      };
    }
    tcvMap[r.track.id] = {
      trackId: r.track.id,
      evals,
      feasible: violationCount === 0,
      failures: [],
      violationCount,
    };
  }

  // ── Step 2: Feasible set ──
  const feasibleIds = new Set(
    catalog.filter(r => tcvMap[r.track.id]?.feasible).map(r => r.track.id),
  );
  const feasibleCount = feasibleIds.size;
  const totalCatalog = catalog.length;
  const survivalRate = totalCatalog > 0 ? (feasibleCount / totalCatalog) * 100 : 0;

  // ── Step 3: Elimination accounting — |F(K \ Ki)| for each Ki ──
  const elimination: EliminationRow[] = [];
  for (const cd of activeConstraints) {
    const marginalFeasibleTracks = catalog.filter(r => {
      for (const other of activeConstraints) {
        if (other.id === cd.id) continue;
        if (!other.test(r)) return false;
      }
      return true;
    });
    const marginalFeasible = marginalFeasibleTracks.length;
    const eliminationImpact = Math.max(0, marginalFeasible - feasibleCount);
    const eliminatedIds = new Set(
      marginalFeasibleTracks
        .filter(r => !feasibleIds.has(r.track.id))
        .map(r => r.track.id),
    );
    elimination.push({
      def: cd,
      marginalFeasible,
      eliminationImpact,
      eliminationPct: totalCatalog > 0 ? (eliminationImpact / totalCatalog) * 100 : 0,
      rank: 0,
      eliminatedIds,
    });
  }

  // Sort by eliminationImpact desc, assign ranks
  elimination.sort((a, b) => b.eliminationImpact - a.eliminationImpact);
  elimination.forEach((e, i) => (e.rank = i + 1));

  // Update TCV failure lists to be ordered by elimination rank
  const rankOrder = elimination.map(e => e.def.id);
  for (const tcv of Object.values(tcvMap)) {
    tcv.failures = rankOrder.filter(id => tcv.evals[id]?.status === 'fail');
  }

  // ── Step 4: CIFE — Constraint-Induced Feasibility Entropy ──
  const baselineEntropy = computeArcEntropy(catalog);
  const feasibleTracks = catalog.filter(r => feasibleIds.has(r.track.id));
  const postConstraintEntropy = computeArcEntropy(feasibleTracks);
  const entropyReduction =
    baselineEntropy > 0
      ? Math.max(0, (baselineEntropy - postConstraintEntropy) / baselineEntropy)
      : 0;

  const totalImpact = elimination.reduce((a, e) => a + e.eliminationImpact, 0);
  const perConstraint = elimination.map(e => {
    const share = totalImpact > 0 ? e.eliminationImpact / totalImpact : 0;
    return {
      id: e.def.id,
      label: e.def.label,
      contribution: entropyReduction * share,
      contributionPct: entropyReduction * share * 100,
    };
  });

  const cife: CIFEResult = {
    baselineEntropy,
    postConstraintEntropy,
    entropyReduction,
    entropyReductionPct: entropyReduction * 100,
    perConstraint,
  };

  // ── Step 5: Pairwise interactions for top-5 constraints ──
  const top5 = elimination.slice(0, 5);
  const interactions: InteractionPair[] = [];
  for (let i = 0; i < top5.length; i++) {
    for (let j = i + 1; j < top5.length; j++) {
      const ki = top5[i], kj = top5[j];
      const combinedMarginal = catalog.filter(r => {
        for (const cd of activeConstraints) {
          if (cd.id === ki.def.id || cd.id === kj.def.id) continue;
          if (!cd.test(r)) return false;
        }
        return true;
      }).length;
      const combinedImpact = Math.max(0, combinedMarginal - feasibleCount);
      const interactionGain = combinedImpact - (ki.eliminationImpact + kj.eliminationImpact);
      interactions.push({
        ki, kj,
        combinedMarginal,
        combinedImpact,
        interactionGain,
        isNonAdditive: interactionGain > Math.max(2, totalCatalog * 0.04),
      });
    }
  }

  // ── Step 6: Brief structural classification ──
  const nonAdditiveCount = interactions.filter(p => p.isNonAdditive).length;
  const interactionDensity = interactions.length > 0 ? nonAdditiveCount / interactions.length : 0;

  let briefType: BriefClassificationType;
  let briefRationale: string;

  if (feasibleCount === 0 && interactionDensity > 0.3) {
    briefType = 'contradictory';
    briefRationale = `Zero feasibility with ${Math.round(interactionDensity * 100)}% of constraint pairs exhibiting non-additive collapse. Constraints may be structurally mutually exclusive.`;
  } else if (feasibleCount === 0) {
    briefType = 'contradictory';
    briefRationale = `No track satisfies the full constraint set (|F| = 0). The brief admits no solution in this catalog.`;
  } else if (feasibleCount <= 3) {
    briefType = 'degenerate';
    briefRationale = `|F| = ${feasibleCount}: solution space has effectively collapsed to a single-point region. Any content decision is fully determined by the constraints.`;
  } else if (survivalRate < 3) {
    briefType = 'over-constrained';
    briefRationale = `${survivalRate.toFixed(1)}% survival rate with ${cife.entropyReductionPct.toFixed(0)}% entropy reduction. Constraint composition eliminates the overwhelming majority of viable content.`;
  } else if (survivalRate > 50 && activeConstraints.length < 3) {
    briefType = 'under-specified';
    briefRationale = `${survivalRate.toFixed(1)}% of catalog survives with only ${activeConstraints.length} active constraint${activeConstraints.length === 1 ? '' : 's'}. Brief does not meaningfully discriminate.`;
  } else {
    briefType = 'well-posed';
    briefRationale = `|F| = ${feasibleCount} (${survivalRate.toFixed(1)}% survival) with ${cife.entropyReductionPct.toFixed(0)}% entropy reduction. Constraint set is discriminating without collapsing the solution space.`;
  }

  const briefClassification: BriefClassification = {
    type: briefType,
    rationale: briefRationale,
    metrics: { feasibleCount, survivalRate, entropyReductionPct: cife.entropyReductionPct, interactionDensity },
  };

  // ── Step 7: Sensitivity surface — top-5 constraints × 2 relaxations ──
  const sensitivity: SensitivityRow[] = top5.map(e => ({
    def: e.def,
    relaxations: e.def.relaxations.map(rel => {
      const count = catalog.filter(r => {
        for (const cd of activeConstraints) {
          const testFn = cd.id === e.def.id ? rel.test : cd.test;
          if (!testFn(r)) return false;
        }
        return true;
      }).length;
      return {
        label: rel.label,
        description: rel.description,
        feasibleCount: count,
        delta: count - feasibleCount,
        deltaPct: totalCatalog > 0 ? ((count - feasibleCount) / totalCatalog) * 100 : 0,
      };
    }),
  }));

  // ── Step 8: Exemplar set — top 8 feasible by arc score ──
  const feasibleResults = catalog
    .filter(r => feasibleIds.has(r.track.id))
    .sort(
      (a, b) =>
        (b.confidenceScore.arcMatch?.combinedScore ?? b.confidenceScore.score) -
        (a.confidenceScore.arcMatch?.combinedScore ?? a.confidenceScore.score),
    )
    .slice(0, 8);

  const nonFeasible = catalog.filter(r => !feasibleIds.has(r.track.id));

  const exemplars: ExemplarRecord[] = feasibleResults.map(r => {
    const tcv = tcvMap[r.track.id];
    const arcScore = r.confidenceScore.arcMatch?.combinedScore ?? r.confidenceScore.score;
    const margins = activeConstraints.map(cd => ({
      constraintId: cd.id,
      label: cd.label,
      margin: tcv.evals[cd.id]?.margin ?? null,
      status: tcv.evals[cd.id]?.status ?? ('pass' as const),
    }));

    let nearestExcluded: ExemplarRecord['nearestExcluded'] = null;
    const rc = r.confidenceScore.songArcCurve;
    if (rc && nonFeasible.length > 0) {
      let minDist = Infinity, minResult: AnalysisResult | null = null;
      for (const nf of nonFeasible) {
        const nc = nf.confidenceScore.songArcCurve;
        if (!nc || nc.length < 4) continue;
        const dist = Math.sqrt([0, 1, 2, 3].reduce((s, i) => s + (rc[i] - nc[i]) ** 2, 0));
        if (dist < minDist) { minDist = dist; minResult = nf; }
      }
      if (minResult) {
        const nTcv = tcvMap[minResult.track.id];
        const failId = nTcv?.failures[0] ?? '';
        const failDef = activeConstraints.find(cd => cd.id === failId);
        nearestExcluded = {
          result: minResult,
          arcDistance: parseFloat(minDist.toFixed(3)),
          failingConstraintId: failId,
          failingLabel: failDef?.label ?? failId,
        };
      }
    }

    return { result: r, tcv, arcScore, margins, nearestExcluded };
  });

  // ── Arc visualization data ──
  const sceneUnitCurve = sceneArc
    ? [sceneArc.opening, sceneArc.heldBreath, sceneArc.turn, sceneArc.release].map(v => v / 100)
    : null;
  const candidateCurves = catalog
    .map(r => r.confidenceScore.songArcCurve)
    .filter((c): c is number[] => c != null && c.length === 4)
    .slice(0, 50);

  return {
    catalog, activeConstraints, tcvMap,
    feasibleCount, totalCatalog, survivalRate, feasibleIds,
    cife, elimination,
    primaryBottleneck: elimination[0] ?? null,
    secondaryBottleneck: elimination[1] ?? null,
    interactions, briefClassification, sensitivity, exemplars,
    sceneUnitCurve, candidateCurves,
    overConstrained: survivalRate < 1.5 || feasibleCount === 0,
  };
}

// ─── Sub-components ─────────────────────────────────────────────────────────────
function SectionHeader({ rank, title, subtitle }: { rank: number; title: string; subtitle?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
      <span style={{ fontFamily: C.mono, fontSize: 9, color: C.lavDim, letterSpacing: '0.08em', minWidth: 16 }}>
        {rank.toString().padStart(2, '0')}
      </span>
      <div>
        <div style={{ fontFamily: C.sans, fontSize: 11, fontWeight: 700, color: C.lavender, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontFamily: C.mono, fontSize: 9, color: C.lavDim, marginTop: 1 }}>{subtitle}</div>
        )}
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: ConstraintType }) {
  const meta = TYPE_META[type];
  return (
    <span
      title={meta.desc}
      style={{
        fontFamily: C.mono, fontSize: 8, fontWeight: 700, color: meta.color,
        background: meta.color + '18', border: `1px solid ${meta.color}30`,
        borderRadius: 3, padding: '1px 4px', letterSpacing: '0.04em', flexShrink: 0,
      }}
    >
      {meta.abbr}
    </span>
  );
}

function MarginPip({ margin, status }: { margin: number | null; status: 'pass' | 'fail' }) {
  if (status === 'fail') {
    return <span style={{ fontFamily: C.mono, fontSize: 9, color: C.bad }}>✕</span>;
  }
  if (margin === null) {
    return <span style={{ fontFamily: C.mono, fontSize: 9, color: C.good }}>✓</span>;
  }
  const barely = margin < 0.05;
  const pct = Math.round(Math.min(99, Math.max(1, margin * 100)));
  return (
    <span style={{ fontFamily: C.mono, fontSize: 9, color: barely ? C.amber : C.good }}>
      {barely ? '⚡' : '+'}{pct}%
    </span>
  );
}

// ─── SVG Arc Cloud ──────────────────────────────────────────────────────────────
function ArcCloudSvg({
  sceneUnitCurve,
  candidateCurves,
  feasibleIds,
  catalog,
}: {
  sceneUnitCurve: number[] | null;
  candidateCurves: number[][];
  feasibleIds: Set<string>;
  catalog: AnalysisResult[];
}) {
  const W = 320, H = 80;
  const feasibleCurveIds = new Set(
    catalog.filter(r => feasibleIds.has(r.track.id) && r.confidenceScore.songArcCurve?.length === 4).map(r => r.track.id),
  );
  const feasibleCurves = catalog
    .filter(r => feasibleCurveIds.has(r.track.id))
    .map(r => r.confidenceScore.songArcCurve as number[]);

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      {/* candidate cloud */}
      {candidateCurves.map((curve, i) => (
        <path
          key={i}
          d={smoothPath(curveToSvgPts(curve, W, H))}
          fill="none"
          stroke="rgba(155,147,196,0.10)"
          strokeWidth={1}
        />
      ))}
      {/* feasible set overlay */}
      {feasibleCurves.map((curve, i) => (
        <path
          key={`f${i}`}
          d={smoothPath(curveToSvgPts(curve, W, H))}
          fill="none"
          stroke="rgba(76,175,130,0.30)"
          strokeWidth={1.2}
        />
      ))}
      {/* scene arc */}
      {sceneUnitCurve && (
        <path
          d={smoothPath(curveToSvgPts(sceneUnitCurve, W, H))}
          fill="none"
          stroke={C.magenta}
          strokeWidth={2}
          strokeDasharray="5 3"
        />
      )}
      {/* axis labels */}
      {['O', 'H', 'T', 'R'].map((lbl, i) => (
        <text
          key={lbl}
          x={6 + (i / 3) * (W - 12)}
          y={H - 1}
          fontSize={7}
          fill="rgba(155,147,196,0.35)"
          fontFamily={C.mono}
          textAnchor="middle"
        >
          {lbl}
        </text>
      ))}
    </svg>
  );
}

// ─── CIFE bar chart ─────────────────────────────────────────────────────────────
function CIFEBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
    </div>
  );
}

// ─── Interaction graph edge ──────────────────────────────────────────────────────
function InteractionEdge({ pair }: { pair: InteractionPair }) {
  const gain = pair.interactionGain;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 32px 1fr', alignItems: 'center', gap: 8,
      padding: '8px 12px', borderRadius: 8,
      background: gain > 0 ? 'rgba(232,90,90,0.06)' : C.lavFaint,
      border: `1px solid ${gain > 0 ? 'rgba(232,90,90,0.18)' : C.hairline}`,
      marginBottom: 6,
    }}>
      <div style={{ fontSize: 11, color: C.silverDim, fontFamily: C.sans }}>
        <TypeBadge type={pair.ki.def.type} />{' '}
        <span style={{ marginLeft: 4 }}>{pair.ki.def.label}</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: C.mono, fontSize: 8, color: gain > 0 ? C.bad : C.lavDim }}>
          {gain > 0 ? `+${gain}` : gain.toFixed(0)}
        </div>
        <div style={{ height: 1, background: gain > 0 ? C.bad : C.hairline, margin: '2px 0' }} />
        <div style={{ fontFamily: C.mono, fontSize: 7, color: C.lavDim }}>Δ</div>
      </div>
      <div style={{ fontSize: 11, color: C.silverDim, fontFamily: C.sans, textAlign: 'right' }}>
        <span style={{ marginRight: 4 }}>{pair.kj.def.label}</span>{' '}
        <TypeBadge type={pair.kj.def.type} />
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
type Props = {
  results: AnalysisResult[];
  sceneArc: SceneArc | null;
  onHighlight?: (ids: Set<string> | null) => void;
};

export function ConstraintDiagnosticEngine({ results, sceneArc, onHighlight }: Props) {
  const [highlightedConstraint, setHighlightedConstraint] = useState<string | null>(null);

  const diag = useMemo(
    () => computeDiagnostic(results, sceneArc),
    [results, sceneArc],
  );

  const handleConstraintClick = (constraintId: string, eliminatedIds: Set<string>) => {
    if (highlightedConstraint === constraintId) {
      setHighlightedConstraint(null);
      onHighlight?.(null);
    } else {
      setHighlightedConstraint(constraintId);
      onHighlight?.(eliminatedIds);
    }
  };

  const sectionStyle: React.CSSProperties = {
    background: C.panel,
    border: `1px solid ${C.hairline}`,
    borderRadius: 12,
    padding: '16px 18px',
    marginBottom: 10,
  };

  const classificationMeta = CLASSIFICATION_META[diag.briefClassification.type];

  return (
    <div style={{ fontFamily: C.sans, color: C.silver, width: '100%', boxSizing: 'border-box' }}>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 1 — FEASIBILITY SUMMARY
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={sectionStyle}>
        <SectionHeader rank={1} title="Feasibility Summary" subtitle={`${diag.activeConstraints.length} active constraints · SCDE v3`} />

        {/* Over-constraint alert */}
        {diag.overConstrained && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 12,
            background: 'rgba(232,90,90,0.08)', border: '1px solid rgba(232,90,90,0.25)',
          }}>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.bad, letterSpacing: '0.06em', marginBottom: 2 }}>
              ◆ BRIEF CRITIQUE — CONSTRAINT SPACE COLLAPSED
            </div>
            <div style={{ fontSize: 11, color: 'rgba(232,90,90,0.85)', lineHeight: 1.5 }}>
              {diag.feasibleCount === 0
                ? `No track in the catalog satisfies the full constraint set. |F| = 0. The brief, as stated, has no solution.`
                : `Survival rate ${diag.survivalRate.toFixed(1)}% — only ${diag.feasibleCount} of ${diag.totalCatalog} tracks satisfy all constraints.`}
            </div>
          </div>
        )}

        {/* Primary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[
            { label: '|C|', value: diag.totalCatalog, sub: 'catalog' },
            { label: '|F|', value: diag.feasibleCount, sub: 'feasible', color: diag.overConstrained ? C.bad : C.good },
            { label: 'S%', value: `${diag.survivalRate.toFixed(1)}%`, sub: 'survival rate' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{ background: C.lavFaint, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: C.mono, fontSize: 9, color: C.lavDim, marginBottom: 3 }}>{label}</div>
              <div style={{ fontFamily: C.serif, fontSize: 22, color: color ?? C.silver, lineHeight: 1 }}>{value}</div>
              <div style={{ fontFamily: C.mono, fontSize: 8, color: C.lavDim, marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Arc cloud */}
        <ArcCloudSvg
          sceneUnitCurve={diag.sceneUnitCurve}
          candidateCurves={diag.candidateCurves}
          feasibleIds={diag.feasibleIds}
          catalog={results}
        />
        <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: C.mono, fontSize: 8, color: C.lavDim }}>
            <span style={{ width: 16, height: 1, background: 'rgba(155,147,196,0.30)', display: 'inline-block' }} />
            catalog ({diag.totalCatalog})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: C.mono, fontSize: 8, color: 'rgba(76,175,130,0.70)' }}>
            <span style={{ width: 16, height: 1, background: 'rgba(76,175,130,0.50)', display: 'inline-block' }} />
            feasible ({diag.feasibleCount})
          </div>
          {diag.sceneUnitCurve && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: C.mono, fontSize: 8, color: 'rgba(219,39,119,0.70)' }}>
              <span style={{ width: 16, height: 1, background: C.magenta, borderTop: '2px dashed', display: 'inline-block' }} />
              scene arc
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 2 — CIFE COLLAPSE ANALYSIS
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={sectionStyle}>
        <SectionHeader rank={2} title="CIFE Collapse Analysis" subtitle="Constraint-Induced Feasibility Entropy" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Baseline entropy', value: diag.cife.baselineEntropy.toFixed(4), sub: 'unconstrained arc diversity' },
            { label: 'Post-constraint entropy', value: diag.cife.postConstraintEntropy.toFixed(4), sub: 'feasible set arc diversity' },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ background: C.lavFaint, borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontFamily: C.mono, fontSize: 8, color: C.lavDim, marginBottom: 3 }}>{label}</div>
              <div style={{ fontFamily: C.mono, fontSize: 14, color: C.silver }}>{value}</div>
              <div style={{ fontFamily: C.mono, fontSize: 8, color: C.lavDim, marginTop: 1 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Entropy reduction headline */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
          background: diag.cife.entropyReductionPct > 80 ? 'rgba(232,90,90,0.06)' : C.ambFaint,
          border: `1px solid ${diag.cife.entropyReductionPct > 80 ? 'rgba(232,90,90,0.18)' : 'rgba(245,181,68,0.18)'}`,
          borderRadius: 8, marginBottom: 14,
        }}>
          <div style={{ fontFamily: C.serif, fontSize: 28, color: diag.cife.entropyReductionPct > 80 ? C.bad : C.amber, lineHeight: 1 }}>
            {diag.cife.entropyReductionPct.toFixed(1)}%
          </div>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.lavender, letterSpacing: '0.06em' }}>ENTROPY REDUCTION</div>
            <div style={{ fontFamily: C.sans, fontSize: 10, color: C.lavDim, marginTop: 2 }}>
              This brief collapses {diag.cife.entropyReductionPct.toFixed(1)}% of feasibility entropy.
            </div>
          </div>
        </div>

        {/* Per-constraint contributions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {diag.cife.perConstraint.map(pc => (
            <div key={pc.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontFamily: C.mono, fontSize: 9, color: C.lavDim, width: 150, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pc.label}
              </div>
              <CIFEBar pct={pc.contributionPct} color={C.amber} />
              <div style={{ fontFamily: C.mono, fontSize: 9, color: C.ambDim, width: 36, textAlign: 'right', flexShrink: 0 }}>
                {pc.contributionPct.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 3 — PRIMARY BOTTLENECK CONSTRAINT
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={sectionStyle}>
        <SectionHeader rank={3} title="Primary Bottleneck Constraint" subtitle="argmax elimination impact" />

        {diag.primaryBottleneck ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[diag.primaryBottleneck, diag.secondaryBottleneck].filter(Boolean).map((bn, idx) => {
              const b = bn!;
              return (
                <div
                  key={b.def.id}
                  style={{
                    background: idx === 0 ? 'rgba(219,39,119,0.07)' : C.lavFaint,
                    border: `1px solid ${idx === 0 ? 'rgba(219,39,119,0.22)' : C.hairline}`,
                    borderRadius: 10, padding: '12px 14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <TypeBadge type={b.def.type} />
                    <span style={{ fontFamily: C.mono, fontSize: 8, color: C.lavDim }}>K{b.rank}</span>
                    {idx === 0 && <span style={{ fontFamily: C.mono, fontSize: 8, color: C.magenta, marginLeft: 'auto' }}>PRIMARY</span>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.silver, marginBottom: 8 }}>{b.def.label}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 9, color: C.lavDim, lineHeight: 1.8 }}>
                    <div>|F| = {diag.feasibleCount}</div>
                    <div>|F(K\K{b.rank})| = {b.marginalFeasible}</div>
                    <div style={{ color: idx === 0 ? C.magenta : C.amber }}>ΔF = +{b.eliminationImpact} ({b.eliminationPct.toFixed(1)}%)</div>
                  </div>
                  <div style={{ fontSize: 9, color: C.lavDim, marginTop: 6, fontFamily: C.sans, lineHeight: 1.4 }}>
                    Removing this constraint would admit {b.eliminationImpact} additional track{b.eliminationImpact !== 1 ? 's' : ''}.
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.lavDim }}>No active constraints.</div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 4 — CONSTRAINT ELIMINATION RANKING
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={sectionStyle}>
        <SectionHeader rank={4} title="Constraint Elimination Ranking" subtitle="click row to highlight eliminated tracks" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '16px 24px 1fr 72px 80px 40px',
            gap: 8, padding: '0 8px 6px',
            fontFamily: C.mono, fontSize: 8, color: C.lavDim, letterSpacing: '0.04em',
            borderBottom: `1px solid ${C.hairline}`,
          }}>
            <span>#</span><span>type</span><span>constraint</span>
            <span style={{ textAlign: 'right' }}>|F(K\Ki)|</span>
            <span style={{ textAlign: 'right' }}>ΔF</span>
            <span style={{ textAlign: 'right' }}>%</span>
          </div>

          {diag.elimination.map(row => {
            const isHighlighted = highlightedConstraint === row.def.id;
            return (
              <div
                key={row.def.id}
                role="button"
                tabIndex={0}
                onClick={() => handleConstraintClick(row.def.id, row.eliminatedIds)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleConstraintClick(row.def.id, row.eliminatedIds)}
                style={{
                  display: 'grid', gridTemplateColumns: '16px 24px 1fr 72px 80px 40px',
                  gap: 8, padding: '7px 8px', borderRadius: 7, cursor: 'pointer',
                  background: isHighlighted ? 'rgba(219,39,119,0.08)' : 'transparent',
                  border: `1px solid ${isHighlighted ? 'rgba(219,39,119,0.25)' : 'transparent'}`,
                  outline: 'none', transition: 'background 0.12s',
                }}
              >
                <span style={{ fontFamily: C.mono, fontSize: 9, color: C.lavDim }}>{row.rank}</span>
                <TypeBadge type={row.def.type} />
                <span style={{ fontSize: 11, color: C.silver, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.def.label}
                  <span style={{ fontFamily: C.mono, fontSize: 8, color: C.lavDim, marginLeft: 6 }}>v{row.def.version}</span>
                </span>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.lavender, textAlign: 'right' }}>{row.marginalFeasible}</span>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: row.eliminationImpact > 0 ? C.amber : C.lavDim, textAlign: 'right' }}>
                  {row.eliminationImpact > 0 ? `+${row.eliminationImpact}` : '—'}
                </span>
                <span style={{ fontFamily: C.mono, fontSize: 9, color: C.lavDim, textAlign: 'right' }}>
                  {row.eliminationPct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 5 — INTERACTION COLLAPSE GRAPH
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={sectionStyle}>
        <SectionHeader
          rank={5}
          title="Interaction Collapse Graph"
          subtitle={`${diag.interactions.filter(p => p.isNonAdditive).length} non-additive pairs detected`}
        />

        {diag.interactions.filter(p => p.isNonAdditive).length > 0 ? (
          <>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.lavDim, marginBottom: 10, lineHeight: 1.5 }}>
              Pairs where combined elimination impact exceeds the sum of individual impacts.
              Positive Δ indicates superadditive collapse — these constraints interact non-linearly.
            </div>
            {diag.interactions
              .filter(p => p.isNonAdditive)
              .sort((a, b) => b.interactionGain - a.interactionGain)
              .map((pair, i) => <InteractionEdge key={i} pair={pair} />)}
            {/* All pairs summary */}
            {diag.interactions.length > 0 && (
              <div style={{ marginTop: 10, padding: '6px 10px', background: C.lavFaint, borderRadius: 6 }}>
                <div style={{ fontFamily: C.mono, fontSize: 8, color: C.lavDim }}>
                  All pairs ({diag.interactions.length}):
                  {' '}{diag.interactions.filter(p => p.isNonAdditive).length} non-additive
                  {' '}({Math.round((diag.interactions.filter(p => p.isNonAdditive).length / diag.interactions.length) * 100)}% interaction density)
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.lavDim, padding: '8px 0' }}>
            No significant non-additive collapse detected across {diag.interactions.length} constraint pair{diag.interactions.length !== 1 ? 's' : ''}.
            Each constraint eliminates approximately independently.
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 6 — BRIEF STRUCTURAL CLASSIFICATION
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={sectionStyle}>
        <SectionHeader rank={6} title="Brief Structural Classification" />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            flexShrink: 0, padding: '6px 12px', borderRadius: 8,
            background: classificationMeta.color + '15',
            border: `1px solid ${classificationMeta.color}35`,
          }}>
            <div style={{ fontFamily: C.mono, fontSize: 8, color: classificationMeta.color + 'AA', letterSpacing: '0.06em', marginBottom: 2 }}>
              CLASSIFICATION
            </div>
            <div style={{ fontFamily: C.serif, fontSize: 16, color: classificationMeta.color }}>
              {classificationMeta.label}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.silverDim, lineHeight: 1.6, marginBottom: 10 }}>
              {diag.briefClassification.rationale}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { label: 'Feasible count', value: `${diag.briefClassification.metrics.feasibleCount}` },
                { label: 'Survival rate', value: `${diag.briefClassification.metrics.survivalRate.toFixed(1)}%` },
                { label: 'Entropy reduction', value: `${diag.briefClassification.metrics.entropyReductionPct.toFixed(0)}%` },
                { label: 'Interaction density', value: `${Math.round(diag.briefClassification.metrics.interactionDensity * 100)}%` },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: C.lavFaint, borderRadius: 6, padding: '5px 8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: C.mono, fontSize: 8, color: C.lavDim }}>{label}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 9, color: C.silver }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Classification legend */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {(Object.entries(CLASSIFICATION_META) as Array<[BriefClassificationType, typeof CLASSIFICATION_META[BriefClassificationType]]>).map(([type, meta]) => (
            <div
              key={type}
              style={{
                fontFamily: C.mono, fontSize: 8, color: meta.color,
                opacity: type === diag.briefClassification.type ? 1 : 0.35,
                padding: '2px 6px', borderRadius: 4,
                background: meta.color + '10',
                border: `1px solid ${type === diag.briefClassification.type ? meta.color + '40' : 'transparent'}`,
              }}
            >
              {meta.label}
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 7 — SENSITIVITY SURFACE
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={sectionStyle}>
        <SectionHeader rank={7} title="Sensitivity Surface" subtitle="ΔF per constraint relaxation — top 5 constraints" />

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: C.mono, fontSize: 9 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', color: C.lavDim, fontWeight: 400, padding: '4px 8px', borderBottom: `1px solid ${C.hairline}` }}>
                  Constraint
                </th>
                <th style={{ textAlign: 'right', color: C.lavDim, fontWeight: 400, padding: '4px 8px', borderBottom: `1px solid ${C.hairline}` }}>
                  Strict (|F|={diag.feasibleCount})
                </th>
                {diag.sensitivity[0]?.relaxations.map(r => (
                  <th key={r.label} style={{ textAlign: 'right', color: C.lavDim, fontWeight: 400, padding: '4px 8px', borderBottom: `1px solid ${C.hairline}` }}>
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diag.sensitivity.map(row => (
                <tr key={row.def.id} style={{ borderBottom: `1px solid ${C.hairline}` }}>
                  <td style={{ padding: '7px 8px', color: C.silverDim, display: 'flex', alignItems: 'center', gap: 5, minWidth: 160 }}>
                    <TypeBadge type={row.def.type} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.def.label}</span>
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: C.lavDim }}>{diag.feasibleCount}</td>
                  {row.relaxations.map(rel => (
                    <td key={rel.label} style={{ padding: '7px 8px', textAlign: 'right' }}>
                      <div style={{ color: rel.delta > 0 ? C.good : C.lavDim }}>{rel.feasibleCount}</div>
                      {rel.delta > 0 && (
                        <div style={{ fontSize: 8, color: C.good }}>+{rel.delta} (+{rel.deltaPct.toFixed(1)}%)</div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 8, color: C.lavDim, marginTop: 8 }}>
          Each row shows feasible set size when that constraint is relaxed; all other constraints remain strict.
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 8 — EXEMPLAR SET (TCV-grounded)
      ══════════════════════════════════════════════════════════════════════════ */}
      <div style={sectionStyle}>
        <SectionHeader
          rank={8}
          title="Exemplar Set"
          subtitle={`${diag.exemplars.length} of ${diag.feasibleCount} feasible tracks — TCV margins + nearest excluded neighbor`}
        />

        {diag.exemplars.length === 0 ? (
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.lavDim }}>|F| = 0 — no exemplars available.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Constraint header row */}
            <div style={{ display: 'flex', gap: 6, paddingBottom: 4, borderBottom: `1px solid ${C.hairline}` }}>
              <div style={{ width: 140, flexShrink: 0 }} />
              {diag.activeConstraints.map(cd => (
                <div
                  key={cd.id}
                  title={cd.label}
                  style={{ width: 36, flexShrink: 0, textAlign: 'center', fontFamily: C.mono, fontSize: 7, color: C.lavDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  <TypeBadge type={cd.type} />
                </div>
              ))}
              <div style={{ flex: 1 }} />
            </div>

            {diag.exemplars.map(ex => {
              const title = ex.result.track.title.replace(/\.(mp3|wav|flac|aiff?)$/i, '').replace(/_/g, ' ').trim().slice(0, 28);
              return (
                <div key={ex.result.track.id} style={{ borderBottom: `1px solid ${C.hairline}`, paddingBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 140, flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: C.silver, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                      <div style={{ fontFamily: C.mono, fontSize: 8, color: C.lavDim }}>arc {ex.arcScore}</div>
                    </div>
                    {ex.margins.map(m => (
                      <div key={m.constraintId} style={{ width: 36, flexShrink: 0, textAlign: 'center' }}>
                        <MarginPip margin={m.margin} status={m.status} />
                      </div>
                    ))}
                    <div style={{ flex: 1 }} />
                  </div>

                  {ex.nearestExcluded && (
                    <div style={{ marginTop: 5, padding: '4px 8px', borderRadius: 5, background: 'rgba(232,90,90,0.05)', border: `1px solid rgba(232,90,90,0.12)` }}>
                      <span style={{ fontFamily: C.mono, fontSize: 7, color: 'rgba(232,90,90,0.60)', letterSpacing: '0.04em' }}>
                        nearest excluded ·{' '}
                      </span>
                      <span style={{ fontFamily: C.mono, fontSize: 8, color: C.lavDim }}>
                        {ex.nearestExcluded.result.track.title.slice(0, 24)}
                      </span>
                      <span style={{ fontFamily: C.mono, fontSize: 7, color: C.lavDim }}>
                        {' '}(d={ex.nearestExcluded.arcDistance}) · eliminated by {ex.nearestExcluded.failingLabel}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, paddingTop: 4, fontFamily: C.mono, fontSize: 8, color: C.lavDim }}>
              <span><span style={{ color: C.good }}>+N%</span> margin above threshold</span>
              <span><span style={{ color: C.amber }}>⚡</span> barely satisfies (&lt;5%)</span>
              <span><span style={{ color: C.bad }}>✕</span> fails</span>
              <span><span style={{ color: C.good }}>✓</span> binary pass</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
