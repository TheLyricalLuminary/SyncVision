/**
 * CatalogShapeAnalysis — Version 2 of SearchAssessment.
 *
 * Answers: "How does this catalog behave relative to the scene?"
 *
 * Seven features:
 *  1. Arc Distribution Overlay  — scene arc + candidate arc cloud
 *  2. Constraint Heatmap        — per-segment compliance across catalog
 *  3. Divergence Detection      — evidence-based mismatch observations
 *  4. Survivorship Funnel       — how count shrinks as constraints stack
 *  5. Rare Pattern Detection    — statistically uncommon emotional shapes
 *  6. Scene Confidence          — catalog coverage confidence (not quality)
 *  7. Interactive Exploration   — click any region to filter matching tracks
 *
 * No recommendations. No ranking changes. No creative judgments.
 * Only measurable catalog behavior, derived from existing analysis data.
 */

import { useMemo, useState } from 'react';
import type { AnalysisResult, SceneArc } from '../utils/apiClient';

// ─── tokens ──────────────────────────────────────────────────────────────────
const C = {
  bg:           '#0F0823',
  surface:      '#130B2B',
  surfaceRaised:'#170D30',
  surfaceAlt:   'rgba(255,255,255,0.025)',
  hover:        'rgba(255,255,255,0.04)',
  hairline:     'rgba(255,255,255,0.07)',
  hairlineMid:  'rgba(255,255,255,0.11)',
  amber:        '#F5B544',
  amberDim:     'rgba(245,181,68,0.55)',
  amberGlow:    'rgba(245,181,68,0.12)',
  magenta:      '#DB2777',
  magentaFaint: 'rgba(219,39,119,0.10)',
  purple:       '#7B70B2',
  lavender:     '#9B93C4',
  lavenderFaint:'rgba(155,147,196,0.08)',
  lavenderDim:  'rgba(155,147,196,0.50)',
  silver:       '#E8E4F0',
  green:        '#22C55E',
  greenFaint:   'rgba(34,197,94,0.10)',
  orange:       '#F97316',
  orangeFaint:  'rgba(249,115,22,0.10)',
  red:          '#EF4444',
  redFaint:     'rgba(239,68,68,0.08)',
  teal:         '#2DD4BF',
};
const SANS  = '"Inter", system-ui, sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO  = '"JetBrains Mono", monospace';

// ─── SVG layout ───────────────────────────────────────────────────────────────
const W = 600, H = 180;
const PAD_L = 12, PAD_R = 12, PAD_T = 22, PAD_B = 20;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const TENSION = 0.35;
const PHASE_LABELS = ['Opening', 'Held Breath', 'Turn', 'Release'];
const PHASE_F = [0, 1 / 3, 2 / 3, 1]; // x fractions for the 4 phases

function px(frac: number) { return PAD_L + frac * PLOT_W; }
function py(val: number)  { return PAD_T + PLOT_H * (1 - Math.max(0, Math.min(1, val))); }

/** Catmull-Rom smooth path through pts. */
function smoothPath(pts: [number, number][]): string {
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * TENSION;
    const cp1y = p1[1] + (p2[1] - p0[1]) * TENSION;
    const cp2x = p2[0] - (p3[0] - p1[0]) * TENSION;
    const cp2y = p2[1] - (p3[1] - p1[1]) * TENSION;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Convert a 4-value curve (0–1 scale) to SVG points. */
function curveToPoints(curve: number[]): [number, number][] {
  return PHASE_F.map((f, i) => [px(f), py(curve[i] ?? 0)]);
}

/** Convert sceneArc (0–100 scale) to 0–1 curve. */
function sceneToUnit(arc: SceneArc): number[] {
  return [arc.opening / 100, arc.heldBreath / 100, arc.turn / 100, arc.release / 100];
}

/** Linearly interpolate a 4-value arc at time t ∈ [0,1]. */
function interpArc(values: number[], t: number): number {
  const n = values.length - 1;
  const scaled = t * n;
  const i = Math.min(Math.floor(scaled), n - 1);
  return values[i] + (scaled - i) * (values[i + 1] - values[i]);
}

// ─── constraint definitions ───────────────────────────────────────────────────

type Constraint = {
  id: string;
  label: string;
  /** test a single track */
  test: (r: AnalysisResult) => boolean;
  /** is this constraint relevant given the scene arc? */
  relevant: (arc: SceneArc | null) => boolean;
};

const CONSTRAINTS: Constraint[] = [
  {
    id: 'low_early_energy',
    label: 'Low early energy',
    test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c[0] <= 0.38; },
    relevant: (a) => !a || a.opening < 50,
  },
  {
    id: 'sustained_build',
    label: 'Sustained build',
    test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 2 && c[1] > c[0] + 0.12; },
    relevant: (a) => !a || (a.heldBreath - a.opening) > 12,
  },
  {
    id: 'sustained_tension_through_turn',
    label: 'Sustained tension through turn',
    test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 3 && c[1] >= 0.52 && c[2] >= 0.50; },
    relevant: () => true,
  },
  {
    id: 'emotional_peak_after_turn',
    label: 'Emotional peak after turn',
    test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 3 && c[2] > c[1]; },
    relevant: () => true,
  },
  {
    id: 'delayed_release',
    label: 'Delayed emotional release',
    test: (r) => {
      const c = r.confidenceScore.songArcCurve;
      return !!c && c.length >= 4 && c[3] < c[2] - 0.18 && c[2] >= 0.50;
    },
    relevant: (a) => !a || (a.turn - a.release) > 12,
  },
  {
    id: 'high_final_intensity',
    label: 'High final intensity',
    test: (r) => { const c = r.confidenceScore.songArcCurve; return !!c && c.length >= 4 && c[3] >= 0.60; },
    relevant: (a) => !a || a.release > 50,
  },
  {
    id: 'cathartic_resolution',
    label: 'Cathartic resolution',
    test: (r) => {
      const c = r.confidenceScore.songArcCurve;
      return !!c && c.length >= 4 && c[2] >= 0.60 && c[3] <= c[2] - 0.28;
    },
    relevant: (a) => !a || (a.turn - a.release) > 22,
  },
  {
    id: 'minor_tonality',
    label: 'Minor or dark tonality',
    test: (r) => {
      const t = (r.track.tonalCharacter ?? '').toLowerCase();
      return t.includes('minor') || t.includes('dorian') || t.includes('phryg');
    },
    relevant: (a) => !a || (a.signals ?? []).some(s =>
      /conflict|dark|betray|grief|loss|tension/i.test(s)),
  },
  {
    id: 'strong_arc_match',
    label: 'Strong arc match (≥ 70)',
    test: (r) => { const m = r.confidenceScore.arcMatch; return !!m && m.combinedScore >= 70; },
    relevant: () => true,
  },
];

// ─── data model ───────────────────────────────────────────────────────────────

type ConstraintCount = Constraint & {
  matchCount: number;
  matchIds: Set<string>;
  total: number;
  pct: number;
};

type HeatCell = {
  t: number;            // centre time 0–1
  sceneval: number;     // scene intensity at this t (0–1)
  avgCandidate: number; // mean of candidate intensities at t
  compliance: number;   // fraction within ±0.20 of scene (0–1)
  variance: number;     // std-dev of candidate values at t
};

type CatalogData = {
  total: number;
  withCurve: number;
  constraints: ConstraintCount[];
  funnelConstraints: ConstraintCount[]; // ordered by descending match count
  allSatisfiedCount: number;
  allSatisfiedIds: Set<string>;
  heatmap: HeatCell[];
  insights: string[];
  rarePatterns: { label: string; count: number; pct: number; ids: Set<string> }[];
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
  /** top 50 candidate curves (0–1 scale) for the overlay */
  topCandidateCurves: number[][];
  peakBeforeTurnCount: number;
  peakBeforeTurnIds: Set<string>;
};

function computeCatalog(results: AnalysisResult[], arc: SceneArc | null): CatalogData {
  const total = results.length;
  const withCurve = results.filter(r => !!r.confidenceScore.songArcCurve?.length).length;

  // Active constraints
  const activeConstraints = CONSTRAINTS.filter(c => c.relevant(arc));

  // Count each constraint
  const constraints: ConstraintCount[] = activeConstraints.map(c => {
    const matching = results.filter(r => c.test(r));
    return {
      ...c,
      matchCount: matching.length,
      matchIds: new Set(matching.map(r => r.track.id)),
      total,
      pct: total > 0 ? Math.round((matching.length / total) * 1000) / 10 : 0,
    };
  });

  // All-satisfied
  const allSatisfiedIds = new Set<string>();
  for (const r of results) {
    if (constraints.every(c => c.test(r))) allSatisfiedIds.add(r.track.id);
  }

  // Funnel — sorted descending by matchCount
  const funnelConstraints = [...constraints].sort((a, b) => b.matchCount - a.matchCount);

  // Peak before turn
  const peakBeforeTurnIds = new Set<string>();
  for (const r of results) {
    const c = r.confidenceScore.songArcCurve;
    if (c && c.length >= 3 && c[1] > c[2]) peakBeforeTurnIds.add(r.track.id);
  }

  // Heatmap — 10 segments
  const sceneUnitCurve = arc ? sceneToUnit(arc) : null;
  const heatmap: HeatCell[] = Array.from({ length: 10 }, (_, seg) => {
    const t = (seg + 0.5) / 10;
    const sceneval = sceneUnitCurve ? interpArc(sceneUnitCurve, t) : 0.5;
    const vals: number[] = [];
    for (const r of results) {
      const c = r.confidenceScore.songArcCurve;
      if (c && c.length >= 4) vals.push(interpArc(c, t));
    }
    const n = vals.length;
    const avg = n > 0 ? vals.reduce((s, v) => s + v, 0) / n : 0;
    const variance = n > 0 ? Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / n) : 0;
    const compliance = n > 0 ? vals.filter(v => Math.abs(v - sceneval) <= 0.22).length / n : 0;
    return { t, sceneval, avgCandidate: avg, compliance, variance };
  });

  // Top 50 candidate curves (sorted by arc match score)
  const sorted = [...results]
    .filter(r => r.confidenceScore.songArcCurve?.length === 4)
    .sort((a, b) => {
      const sa = a.confidenceScore.arcMatch?.combinedScore ?? a.confidenceScore.score;
      const sb = b.confidenceScore.arcMatch?.combinedScore ?? b.confidenceScore.score;
      return sb - sa;
    })
    .slice(0, 50);
  const topCandidateCurves = sorted.map(r => r.confidenceScore.songArcCurve!);

  // Rare patterns (< 10% of catalog with a curve)
  const rarePatterns: CatalogData['rarePatterns'] = [];
  for (const c of constraints) {
    if (c.pct < 10 && c.pct > 0) {
      rarePatterns.push({ label: c.label, count: c.matchCount, pct: c.pct, ids: c.matchIds });
    }
  }
  rarePatterns.sort((a, b) => a.pct - b.pct);

  // Insights
  const insights = buildInsights(constraints, total, withCurve, arc, peakBeforeTurnIds.size);

  // Confidence
  const allSat = allSatisfiedIds.size;
  const allSatFrac = total > 0 ? allSat / total : 0;
  let confidence: CatalogData['confidence'];
  let confidenceReason: string;
  if (allSatFrac >= 0.12) {
    confidence = 'high';
    confidenceReason = `${allSat} of ${total} tracks satisfy all identified scene constraints.`;
  } else if (allSatFrac >= 0.02) {
    confidence = 'medium';
    confidenceReason = `${allSat} of ${total} tracks satisfy all identified scene constraints.`;
  } else if (allSat === 0) {
    confidence = 'low';
    confidenceReason = `No tracks satisfy all identified scene constraints across ${total} candidates.`;
  } else {
    confidence = 'low';
    confidenceReason = `Only ${allSat} of ${total} analyzed tracks satisfy all identified scene constraints.`;
  }

  return {
    total, withCurve, constraints, funnelConstraints,
    allSatisfiedCount: allSatisfiedIds.size, allSatisfiedIds,
    heatmap, insights, rarePatterns, confidence, confidenceReason,
    topCandidateCurves,
    peakBeforeTurnCount: peakBeforeTurnIds.size,
    peakBeforeTurnIds,
  };
}

function buildInsights(
  cs: ConstraintCount[],
  total: number,
  withCurve: number,
  arc: SceneArc | null,
  peakBeforeTurnCount: number,
): string[] {
  const out: string[] = [];
  const get = (id: string) => cs.find(c => c.id === id);

  // Peak timing
  const peakAfter = get('emotional_peak_after_turn');
  if (peakAfter && withCurve > 0) {
    const earlyPct = Math.round(((withCurve - peakAfter.matchCount) / withCurve) * 100);
    if (earlyPct > 55) {
      out.push(`${earlyPct}% of candidates peak before the scene turn — most resolve emotionally earlier than the target arc.`);
    } else if (earlyPct < 35) {
      out.push(`${100 - earlyPct}% of candidates align their peak with or after the scene turn — strong timing alignment across the catalog.`);
    }
  }

  // Delayed release
  const delayed = get('delayed_release');
  if (delayed) {
    if (delayed.matchCount === 0 && arc && (arc.turn - arc.release) > 15) {
      out.push(`Late emotional releases are uncommon in this catalog — no candidates withhold resolution past the turn.`);
    } else if (delayed.pct < 8) {
      out.push(`Delayed emotional release appears underrepresented — only ${delayed.pct}% of candidates delay resolution past the turn.`);
    }
  }

  // Sustained tension
  const sustained = get('sustained_tension_through_turn');
  if (sustained) {
    if (sustained.pct < 10) {
      out.push(`Only ${sustained.pct}% of candidates sustain tension through both the held-breath and turn phases.`);
    } else if (sustained.pct > 50) {
      out.push(`More than half the catalog maintains tension through the scene turn — the catalog broadly supports this structural requirement.`);
    }
  }

  // Cathartic
  const cathartic = get('cathartic_resolution');
  if (cathartic && cathartic.pct > 40) {
    out.push(`Cathartic resolutions are common — ${cathartic.pct}% of candidates drop significantly after a peak.`);
  } else if (cathartic && cathartic.pct < 6) {
    out.push(`Strong post-peak drops are rare — most candidates sustain energy through the end rather than releasing it.`);
  }

  // Arc match
  const strong = get('strong_arc_match');
  if (strong) {
    if (strong.matchCount === 0) {
      out.push(`No candidates score ≥ 70 on combined arc alignment — the scene's emotional shape is an unusual structural target for this catalog.`);
    } else if (strong.pct < 8) {
      out.push(`Fewer than 8% of candidates achieve strong arc alignment — this is a specific structural requirement.`);
    } else if (strong.pct > 35) {
      out.push(`${strong.pct}% of candidates achieve strong arc alignment — multiple structurally fitting options available.`);
    }
  }

  // Scene uncertainty
  if (arc && arc.narrativeCertainty < 0.45) {
    out.push(`Scene arc was extracted with lower narrative certainty (${Math.round(arc.narrativeCertainty * 100)}%) — constraint thresholds are approximations.`);
  }

  return out.slice(0, 5);
}

// ─── component ────────────────────────────────────────────────────────────────

export type Props = {
  results: AnalysisResult[];
  sceneArc: SceneArc | null;
  /** Called when the user clicks a region — parent can use to highlight/dim rows */
  onHighlight?: (ids: Set<string> | null) => void;
};

export function CatalogShapeAnalysis({ results, sceneArc, onHighlight }: Props) {
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const data = useMemo(() => computeCatalog(results, sceneArc), [results, sceneArc]);

  if (results.length === 0 || data.constraints.length === 0) return null;

  const sceneUnitCurve = sceneArc ? sceneToUnit(sceneArc) : null;

  function handleRegionClick(id: string, ids: Set<string>) {
    if (activeRegion === id) {
      setActiveRegion(null);
      onHighlight?.(null);
    } else {
      setActiveRegion(id);
      onHighlight?.(ids);
    }
  }

  return (
    <div style={{ marginBottom: 28, fontFamily: SANS }}>

      {/* ═══ HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.amberDim, marginBottom: 4 }}>
            Catalog Shape Analysis
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 'clamp(17px,2vw,22px)', color: C.silver, lineHeight: 1.1, letterSpacing: '-0.01em' }}>
            {data.total.toLocaleString()} tracks analyzed
          </div>
          <div style={{ fontSize: 11, color: C.lavenderDim, marginTop: 3 }}>
            {data.withCurve.toLocaleString()} with full arc data · {data.constraints.length} scene constraints active
          </div>
        </div>
        <ConfidenceBadge level={data.confidence} reason={data.confidenceReason} />
      </div>

      {/* ═══ FEATURE 1 + 2: Arc overlay + heatmap ═══════════════════════════ */}
      <div style={{ borderRadius: 14, background: C.surface, border: `1px solid ${C.hairline}`, overflow: 'hidden', marginBottom: 10 }}>
        <SectionLabel label="Arc Distribution" sub="Scene arc + top 50 candidate arcs" />

        {/* SVG arc cloud */}
        <div style={{ padding: '0 16px 4px' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', display: 'block', overflow: 'visible' }}
          >
            {/* phase dividers */}
            {PHASE_F.slice(1, 3).map((f, i) => (
              <line
                key={i}
                x1={px(f)} y1={PAD_T} x2={px(f)} y2={PAD_T + PLOT_H}
                stroke={C.hairline} strokeWidth="1"
              />
            ))}

            {/* phase labels */}
            {PHASE_F.map((f, i) => (
              <text
                key={i}
                x={px(f)}
                y={PAD_T - 6}
                textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}
                fontSize="9"
                fill={C.lavenderDim}
                fontFamily={SANS}
                letterSpacing="0.08em"
              >
                {PHASE_LABELS[i].toUpperCase()}
              </text>
            ))}

            {/* candidate arc cloud */}
            {data.topCandidateCurves.map((curve, i) => {
              const pts = curveToPoints(curve);
              return (
                <path
                  key={i}
                  d={smoothPath(pts)}
                  fill="none"
                  stroke={`rgba(155,147,196,0.09)`}
                  strokeWidth="1.2"
                />
              );
            })}

            {/* scene arc — prominent, on top */}
            {sceneUnitCurve && (
              <>
                {/* glow */}
                <path
                  d={smoothPath(curveToPoints(sceneUnitCurve))}
                  fill="none"
                  stroke="rgba(219,39,119,0.18)"
                  strokeWidth="6"
                />
                {/* line */}
                <path
                  d={smoothPath(curveToPoints(sceneUnitCurve))}
                  fill="none"
                  stroke={C.magenta}
                  strokeWidth="2.5"
                  strokeDasharray="5,3"
                />
                {/* phase dots */}
                {sceneUnitCurve.map((v, i) => (
                  <circle key={i} cx={px(PHASE_F[i])} cy={py(v)} r="3.5" fill={C.magenta} opacity="0.9" />
                ))}
              </>
            )}

            {/* legend */}
            <g transform={`translate(${W - PAD_R - 2},${PAD_T + 6})`}>
              <line x1="-38" y1="0" x2="-22" y2="0" stroke={C.magenta} strokeWidth="1.8" strokeDasharray="4,2" />
              <text x="-18" y="3.5" fontSize="8" fill={C.lavenderDim} fontFamily={SANS}>Scene arc</text>
              <line x1="-38" y1="12" x2="-22" y2="12" stroke="rgba(155,147,196,0.5)" strokeWidth="1.5" />
              <text x="-18" y="15.5" fontSize="8" fill={C.lavenderDim} fontFamily={SANS}>Candidates</text>
            </g>
          </svg>
        </div>

        {/* FEATURE 2: Heatmap */}
        <div style={{ padding: '6px 16px 14px' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavenderDim, marginBottom: 6 }}>
            Constraint Compliance Heatmap
          </div>
          <div style={{ display: 'flex', gap: 3, height: 32, alignItems: 'flex-end' }}>
            {data.heatmap.map((cell, i) => {
              const h = Math.max(8, Math.round(cell.compliance * 32));
              const fill = cell.compliance >= 0.7
                ? `rgba(34,197,94,${0.4 + cell.compliance * 0.5})`
                : cell.compliance >= 0.35
                ? `rgba(245,181,68,${0.3 + cell.compliance * 0.6})`
                : `rgba(239,68,68,${0.25 + (1 - cell.compliance) * 0.35})`;
              return (
                <div
                  key={i}
                  title={`t=${Math.round(cell.t * 100)}% — ${Math.round(cell.compliance * 100)}% compliance`}
                  style={{ flex: 1, height: h, background: fill, borderRadius: 2, cursor: 'default', transition: 'opacity .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 9, color: C.lavenderDim }}>0%</span>
            <span style={{ fontSize: 9, color: C.lavenderDim }}>50%</span>
            <span style={{ fontSize: 9, color: C.lavenderDim }}>100%</span>
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {data.heatmap
              .filter(cell => cell.compliance < 0.20 || cell.compliance > 0.75)
              .slice(0, 3)
              .map((cell, i) => {
                const pct = Math.round(cell.compliance * 100);
                const t   = Math.round(cell.t * 100);
                const sceneIntent = sceneArc
                  ? interpretSceneAt(cell.t, sceneArc)
                  : null;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.lavender }}>
                    <span style={{ fontFamily: MONO, color: cell.compliance < 0.2 ? C.red : C.green, fontSize: 11, minWidth: 32, textAlign: 'right' }}>
                      {pct}%
                    </span>
                    <span>of candidates comply at {t}%{sceneIntent ? ` — scene ${sceneIntent}` : ''}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* ═══ FEATURE 3: Divergence Detection ════════════════════════════════ */}
      {(data.insights.length > 0 || data.peakBeforeTurnCount > 0) && (
        <div style={{ borderRadius: 14, background: C.surface, border: `1px solid ${C.hairline}`, overflow: 'hidden', marginBottom: 10 }}>
          <SectionLabel label="Divergence Analysis" sub="Where the catalog departs from the scene" />
          <div style={{ padding: '4px 0 8px' }}>
            {/* peak before turn — interactive */}
            {data.peakBeforeTurnCount > 0 && (
              <InteractiveInsight
                id="peak_before_turn"
                active={activeRegion === 'peak_before_turn'}
                count={data.peakBeforeTurnCount}
                total={data.total}
                text={`${Math.round(data.peakBeforeTurnCount / data.total * 100)}% of tracks peak before the scene turn.`}
                onToggle={() => handleRegionClick('peak_before_turn', data.peakBeforeTurnIds)}
              />
            )}
            {/* constraint-based divergence insights */}
            {data.insights.map((txt, i) => (
              <InsightRow key={i} text={txt} />
            ))}
          </div>
        </div>
      )}

      {/* ═══ FEATURE 4: Survivorship Funnel ══════════════════════════════════ */}
      <div style={{ borderRadius: 14, background: C.surface, border: `1px solid ${C.hairline}`, overflow: 'hidden', marginBottom: 10 }}>
        <SectionLabel label="Constraint Survivorship" sub="How the candidate pool narrows as constraints stack" />
        <div style={{ padding: '4px 16px 14px' }}>
          <FunnelView
            total={data.total}
            constraints={data.funnelConstraints}
            allSatisfied={data.allSatisfiedCount}
            activeRegion={activeRegion}
            onRegionClick={handleRegionClick}
          />
        </div>
      </div>

      {/* ═══ FEATURE 5: Rare Patterns ════════════════════════════════════════ */}
      {data.rarePatterns.length > 0 && (
        <div style={{ borderRadius: 14, background: C.surface, border: `1px solid ${C.hairline}`, overflow: 'hidden', marginBottom: 10 }}>
          <SectionLabel label="Rare Pattern Detection" sub="Emotionally uncommon structures in this catalog" />
          <div style={{ padding: '4px 0 8px' }}>
            {data.rarePatterns.map(p => (
              <InteractiveInsight
                key={p.label}
                id={`rare_${p.label}`}
                active={activeRegion === `rare_${p.label}`}
                count={p.count}
                total={data.total}
                text={`${p.label} appears in ${p.pct}% of candidates.`}
                onToggle={() => handleRegionClick(`rare_${p.label}`, p.ids)}
              />
            ))}
          </div>
        </div>
      )}

      {/* active filter banner */}
      {activeRegion && (
        <div style={{
          borderRadius: 9, padding: '10px 14px',
          background: C.amberGlow, border: `1px solid rgba(245,181,68,0.22)`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12, color: C.amber, marginBottom: 10,
        }}>
          <span>Tracks matching this pattern are highlighted in the list below.</span>
          <button
            type="button"
            onClick={() => { setActiveRegion(null); onHighlight?.(null); }}
            style={{ background: 'none', border: 'none', color: C.amberDim, cursor: 'pointer', fontSize: 12, padding: 0 }}
          >
            Clear filter ×
          </button>
        </div>
      )}

    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label, sub }: { label: string; sub?: string }) {
  return (
    <div style={{ padding: '12px 16px 8px', borderBottom: `1px solid ${C.hairline}` }}>
      <span style={{ fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: C.amberDim }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color: C.lavenderDim, marginLeft: 10 }}>{sub}</span>}
    </div>
  );
}

function ConfidenceBadge({ level, reason }: { level: 'high' | 'medium' | 'low'; reason: string }) {
  const colors = {
    high:   { bg: C.greenFaint,  border: 'rgba(34,197,94,0.22)',   text: C.green  },
    medium: { bg: C.amberGlow,   border: 'rgba(245,181,68,0.22)',  text: C.amber  },
    low:    { bg: C.redFaint,    border: 'rgba(239,68,68,0.22)',   text: C.red    },
  };
  const col = colors[level];
  return (
    <div title={reason} style={{
      padding: '7px 12px', borderRadius: 9, cursor: 'help',
      background: col.bg, border: `1px solid ${col.border}`,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0,
    }}>
      <span style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: col.text, fontFamily: SANS }}>Scene Confidence</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: col.text, fontFamily: MONO, letterSpacing: '-0.01em' }}>
        {level.charAt(0).toUpperCase() + level.slice(1)}
      </span>
    </div>
  );
}

function InsightRow({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '7px 16px', alignItems: 'flex-start' }}>
      <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.amber, marginTop: 7, flexShrink: 0, opacity: 0.6 }} />
      <p style={{ margin: 0, fontSize: 13, color: C.lavender, lineHeight: 1.6, fontFamily: SANS }}>{text}</p>
    </div>
  );
}

function InteractiveInsight({
  id, active, count, total, text, onToggle,
}: {
  id: string; active: boolean; count: number; total: number; text: string; onToggle: () => void;
}) {
  const pct = Math.round((count / total) * 100);
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex', gap: 10, padding: '8px 16px', alignItems: 'center',
        width: '100%', background: active ? C.amberGlow : 'transparent',
        border: 'none', borderLeft: `2px solid ${active ? C.amber : 'transparent'}`,
        cursor: 'pointer', textAlign: 'left', transition: 'background .12s',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget.style.background = C.hover); }}
      onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent'); }}
    >
      <span style={{ fontFamily: MONO, fontSize: 12, color: active ? C.amber : C.silver, minWidth: 32, textAlign: 'right', flexShrink: 0 }}>
        {pct}%
      </span>
      <span style={{ fontSize: 13, color: active ? C.amber : C.lavender, lineHeight: 1.5, flex: 1 }}>{text}</span>
      <span style={{ fontSize: 10, color: C.lavenderDim, flexShrink: 0, fontFamily: MONO }}>
        {active ? 'clear' : `${count} tracks`}
      </span>
    </button>
  );
}

function FunnelView({
  total, constraints, allSatisfied, activeRegion, onRegionClick,
}: {
  total: number;
  constraints: ConstraintCount[];
  allSatisfied: number;
  activeRegion: string | null;
  onRegionClick: (id: string, ids: Set<string>) => void;
}) {
  const maxCount = total;

  const rows: { label: string; count: number; id: string; ids: Set<string>; isAll?: boolean }[] = [
    { label: 'Tracks analyzed', count: total, id: '__all__', ids: new Set() },
    ...constraints.map(c => ({ label: c.label, count: c.matchCount, id: c.id, ids: c.matchIds })),
    { label: 'Satisfy all constraints', count: allSatisfied, id: '__satisfied__', ids: new Set(), isAll: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
      {rows.map((row, i) => {
        const widthPct = maxCount > 0 ? Math.max(4, (row.count / maxCount) * 100) : 4;
        const isBase = row.id === '__all__';
        const isFinal = row.id === '__satisfied__';
        const active = activeRegion === row.id;
        const fillColor = isFinal
          ? (allSatisfied > 0 ? C.green : C.lavenderDim)
          : isBase
          ? C.purple
          : C.amber;
        const clickable = !isBase && row.count > 0;

        return (
          <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* count */}
            <div style={{
              fontFamily: MONO, fontSize: 12, fontWeight: isBase || isFinal ? 700 : 500,
              color: isBase ? C.silver : isFinal ? (allSatisfied > 0 ? C.green : C.lavenderDim) : C.silver,
              minWidth: 48, textAlign: 'right', flexShrink: 0,
            }}>
              {row.count.toLocaleString()}
            </div>

            {/* bar */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onRegionClick(row.id, row.ids)}
                style={{
                  display: 'block', width: `${widthPct}%`, minWidth: isBase ? '100%' : undefined,
                  height: isBase ? 10 : 7, borderRadius: 3,
                  background: active
                    ? C.amber
                    : `${fillColor}${isBase ? '' : '88'}`,
                  border: active ? `1px solid ${C.amber}` : '1px solid transparent',
                  cursor: clickable ? 'pointer' : 'default',
                  padding: 0, transition: 'width .3s ease, background .15s',
                }}
                title={clickable ? `Click to highlight these ${row.count} tracks` : undefined}
              />
            </div>

            {/* label */}
            <div style={{
              fontSize: 11, color: active ? C.amber : isBase ? C.silver : C.lavender,
              minWidth: 0, flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {row.label}
              {!isBase && !isFinal && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.lavenderDim, marginLeft: 5 }}>
                  {maxCount > 0 ? (row.count / maxCount * 100).toFixed(0) : 0}%
                </span>
              )}
              {isFinal && allSatisfied > 0 && (
                <span style={{ color: C.amberDim, marginLeft: 6, fontSize: 10 }}>— showing first</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Returns a short phrase describing what the scene expects at time t. */
function interpretSceneAt(t: number, arc: SceneArc): string | null {
  const unit = sceneToUnit(arc);
  const val  = interpArc(unit, t);
  const prev = t > 0.1 ? interpArc(unit, t - 0.1) : null;
  if (val > 0.70) return 'expects high tension';
  if (val < 0.28) return 'expects low intensity';
  if (prev !== null && val - prev > 0.10) return 'expects rising tension';
  if (prev !== null && prev - val > 0.10) return 'expects resolution';
  return null;
}
