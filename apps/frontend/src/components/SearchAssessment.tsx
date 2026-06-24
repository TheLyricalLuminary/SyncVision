/**
 * SearchAssessment — characterizes the entire search space before showing
 * any individual track.
 *
 * Goal: help a supervisor understand the shape of the catalog against the
 * scene requirements before they evaluate a single song.
 *
 * What this is NOT:
 *   - Not a ranking change
 *   - Not a recommendation
 *   - Not a score
 *
 * What this IS:
 *   - How many tracks satisfy each scene constraint
 *   - Which constraints are rare in this catalog
 *   - Evidence-based observations about the search space
 */

import { useMemo, useState } from 'react';
import type { AnalysisResult, SceneArc } from '../utils/apiClient';

// ─── design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:            '#0F0823',
  surface:       '#130B2B',
  surfaceAlt:    'rgba(255,255,255,0.025)',
  surfaceHover:  'rgba(255,255,255,0.04)',
  hairline:      'rgba(255,255,255,0.07)',
  hairlineMid:   'rgba(255,255,255,0.10)',
  amber:         '#F5B544',
  amberDim:      'rgba(245,181,68,0.55)',
  magenta:       '#DB2777',
  purple:        '#7B70B2',
  lavender:      '#9B93C4',
  lavenderDim:   'rgba(155,147,196,0.55)',
  silver:        '#E8E4F0',
  green:         '#22C55E',
  orange:        '#F97316',
  red:           '#EF4444',
  teal:          '#2DD4BF',
};
const SANS  = '"Inter", system-ui, sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO  = '"JetBrains Mono", monospace';

// ─── constraint definitions ───────────────────────────────────────────────────

/**
 * A SceneConstraint describes one structural requirement derived from either
 * the scene arc or track metadata. Each has a human label, a description of
 * how it was derived, and a test function.
 *
 * songArc values are 0–1. sceneArc values are 0–100.
 */
type ConstraintDef = {
  id: string;
  label: string;
  /** What data drives this test — shown in the coverage table */
  source: 'arc' | 'tonal' | 'energy' | 'valence' | 'signal';
  /** One-line description of what a matching track must have */
  description: string;
  /** Returns true if this track satisfies the constraint */
  test: (r: AnalysisResult) => boolean;
  /**
   * Returns true if this constraint is relevant to show given the scene.
   * Some constraints only make sense when the scene arc has a certain shape.
   */
  relevant: (arc: SceneArc | null) => boolean;
};

function buildConstraints(arc: SceneArc | null): ConstraintDef[] {
  const ALL: ConstraintDef[] = [

    // ── Arc-based ────────────────────────────────────────────────────────────

    {
      id: 'low_early_energy',
      label: 'Low early energy',
      source: 'arc',
      description: 'Opens at or below 35% intensity — understated first act',
      test: (r) => {
        const c = r.confidenceScore.songArcCurve;
        return !!c && c.length >= 1 && c[0] <= 0.35;
      },
      relevant: (a) => !a || a.opening < 45,
    },

    {
      id: 'sustained_build',
      label: 'Sustained build',
      source: 'arc',
      description: 'Intensity climbs from opening through the held-breath phase',
      test: (r) => {
        const c = r.confidenceScore.songArcCurve;
        return !!c && c.length >= 2 && c[1] > c[0] + 0.12;
      },
      relevant: (a) => !a || a.heldBreath - a.opening > 15,
    },

    {
      id: 'sustained_tension_through_turn',
      label: 'Sustained tension through turn',
      source: 'arc',
      description: 'Stays above 55% intensity through both held-breath and turn phases',
      test: (r) => {
        const c = r.confidenceScore.songArcCurve;
        return !!c && c.length >= 3 && c[1] >= 0.55 && c[2] >= 0.52;
      },
      relevant: () => true,
    },

    {
      id: 'emotional_peak_at_turn',
      label: 'Emotional peak at the turn',
      source: 'arc',
      description: 'Reaches peak intensity at the scene turn, not before it',
      test: (r) => {
        const c = r.confidenceScore.songArcCurve;
        return !!c && c.length >= 3 && c[2] >= 0.62 && c[2] >= c[1] - 0.06;
      },
      relevant: (a) => !a || a.turn > 60,
    },

    {
      id: 'emotional_peak_after_turn',
      label: 'Emotional peak after turn',
      source: 'arc',
      description: 'Turn exceeds held-breath — climax arrives at or after the scene's pivot',
      test: (r) => {
        const c = r.confidenceScore.songArcCurve;
        return !!c && c.length >= 3 && c[2] > c[1];
      },
      relevant: () => true,
    },

    {
      id: 'delayed_release',
      label: 'Delayed emotional release',
      source: 'arc',
      description: 'Resolution withheld until after the turn — tension doesn\'t break early',
      test: (r) => {
        const c = r.confidenceScore.songArcCurve;
        return !!c && c.length >= 4 && c[3] < c[2] - 0.18 && c[2] >= 0.52;
      },
      relevant: (a) => !a || (a.turn - a.release) > 15,
    },

    {
      id: 'high_final_intensity',
      label: 'High final intensity',
      source: 'arc',
      description: 'Resolution remains elevated — ends with energy rather than fading out',
      test: (r) => {
        const c = r.confidenceScore.songArcCurve;
        return !!c && c.length >= 4 && c[3] >= 0.62;
      },
      relevant: (a) => !a || a.release > 55,
    },

    {
      id: 'cathartic_resolution',
      label: 'Cathartic resolution',
      source: 'arc',
      description: 'Strong drop after turn — emotional exhale following a peak',
      test: (r) => {
        const c = r.confidenceScore.songArcCurve;
        return !!c && c.length >= 4 && c[2] >= 0.62 && c[3] <= c[2] - 0.30;
      },
      relevant: (a) => !a || (a.turn - a.release) > 28,
    },

    // ── Valence-based ─────────────────────────────────────────────────────────

    {
      id: 'negative_valence_opening',
      label: 'Negative opening valence',
      source: 'valence',
      description: 'Opens with dark or conflicted emotional direction',
      test: (r) => {
        const v = r.confidenceScore.songArcValenceCurve;
        return !!v && v.length >= 1 && v[0] < -0.1;
      },
      relevant: (a) => !a || (a.valenceCurve?.[0] ?? 0) < 0,
    },

    {
      id: 'positive_valence_resolution',
      label: 'Positive valence at resolution',
      source: 'valence',
      description: 'Resolves with upward emotional direction — empowerment or hope',
      test: (r) => {
        const v = r.confidenceScore.songArcValenceCurve;
        return !!v && v.length >= 4 && v[3] > 0.15;
      },
      relevant: (a) => !a || (a.valenceCurve?.[3] ?? 0) > 0,
    },

    {
      id: 'valence_arc_matches',
      label: 'Valence arc aligned',
      source: 'valence',
      description: 'Emotional direction matches the scene's signed arc (both magnitude and sign)',
      test: (r) => {
        const match = r.confidenceScore.arcMatch;
        return !!match && match.valenceScore >= 60;
      },
      relevant: () => true,
    },

    // ── Tonal character ───────────────────────────────────────────────────────

    {
      id: 'minor_tonality',
      label: 'Minor or dark tonality',
      source: 'tonal',
      description: 'Minor key, dorian, or phrygian — darker harmonic character',
      test: (r) => {
        const t = (r.track.tonalCharacter ?? '').toLowerCase();
        return t.includes('minor') || t.includes('dorian') || t.includes('phryg');
      },
      relevant: (a) => !a || (a.category ?? '').toLowerCase().includes('tension')
        || (a.signals ?? []).some(s => s.toLowerCase().includes('conflict')
          || s.toLowerCase().includes('dark')
          || s.toLowerCase().includes('betray')),
    },

    {
      id: 'major_tonality',
      label: 'Major or bright tonality',
      source: 'tonal',
      description: 'Major key or lydian — bright, resolved harmonic character',
      test: (r) => {
        const t = (r.track.tonalCharacter ?? '').toLowerCase();
        return t.includes('major') || t.includes('lydian');
      },
      relevant: (a) => !a || (a.category ?? '').toLowerCase().includes('uplift')
        || (a.signals ?? []).some(s => s.toLowerCase().includes('empower')
          || s.toLowerCase().includes('triumph')
          || s.toLowerCase().includes('hope')),
    },

    // ── Energy character ──────────────────────────────────────────────────────

    {
      id: 'high_energy',
      label: 'High overall energy',
      source: 'energy',
      description: 'High RMS energy or explicitly high-energy character',
      test: (r) => {
        const e = (r.track.energyCharacter ?? '').toLowerCase();
        const rms = r.track.rmsEnergy ?? 0;
        return e.includes('high') || e.includes('intense') || rms > 0.68;
      },
      relevant: (a) => !a || a.turn > 65,
    },

    {
      id: 'low_energy',
      label: 'Low or restrained energy',
      source: 'energy',
      description: 'Low RMS energy or restrained energy character',
      test: (r) => {
        const e = (r.track.energyCharacter ?? '').toLowerCase();
        const rms = r.track.rmsEnergy ?? 1;
        return e.includes('low') || e.includes('restrain') || e.includes('quiet') || rms < 0.32;
      },
      relevant: (a) => !a || a.opening < 40,
    },

    // ── Arc match quality ─────────────────────────────────────────────────────

    {
      id: 'strong_arc_match',
      label: 'Strong arc match',
      source: 'signal',
      description: 'Combined arc score ≥ 70 — shape and direction both align with scene',
      test: (r) => {
        const m = r.confidenceScore.arcMatch;
        return !!m && m.combinedScore >= 70;
      },
      relevant: () => true,
    },

  ];

  // Filter to constraints relevant to this scene
  return ALL.filter((c) => c.relevant(arc));
}

// ─── computation ──────────────────────────────────────────────────────────────

type ConstraintResult = ConstraintDef & {
  matchCount: number;
  total: number;
  pct: number; // 0–100
};

type Assessment = {
  total: number;
  constraints: ConstraintResult[];
  allSatisfiedCount: number;
  allSatisfiedIds: Set<string>;
  insights: string[];
};

function computeAssessment(
  results: AnalysisResult[],
  arc: SceneArc | null
): Assessment {
  const total = results.length;
  const constraintDefs = buildConstraints(arc);

  // Count each constraint
  const constraints: ConstraintResult[] = constraintDefs.map((def) => {
    const matches = results.filter((r) => def.test(r));
    return {
      ...def,
      matchCount: matches.length,
      total,
      pct: total > 0 ? Math.round((matches.length / total) * 100 * 10) / 10 : 0,
    };
  });

  // Tracks satisfying ALL constraints
  const allSatisfiedIds = new Set<string>();
  for (const r of results) {
    if (constraints.every((c) => c.test(r))) {
      allSatisfiedIds.add(r.track.id);
    }
  }

  const insights = generateInsights(constraints, total, arc);

  return { total, constraints, allSatisfiedCount: allSatisfiedIds.size, allSatisfiedIds, insights };
}

// ─── insights ─────────────────────────────────────────────────────────────────

function generateInsights(
  constraints: ConstraintResult[],
  total: number,
  arc: SceneArc | null
): string[] {
  if (total === 0) return [];
  const out: string[] = [];

  const get = (id: string) => constraints.find((c) => c.id === id);

  // Peak timing
  const peakAtTurn   = get('emotional_peak_at_turn');
  const peakAfterTurn = get('emotional_peak_after_turn');
  const delayed      = get('delayed_release');
  const cathartic    = get('cathartic_resolution');

  if (peakAtTurn && peakAfterTurn) {
    const earlyPeakCount = total - (peakAfterTurn.matchCount);
    if (earlyPeakCount > total * 0.55) {
      out.push(`Most candidates peak before the scene turn — ${earlyPeakCount} of ${total} tracks resolve earlier than the target arc.`);
    } else if (peakAfterTurn.matchCount > total * 0.60) {
      out.push(`Most candidates align their peak with or after the scene turn — strong structural fit across the catalog.`);
    }
  }

  // Delayed release rarity
  if (delayed && delayed.matchCount < total * 0.15) {
    if (delayed.matchCount === 0) {
      out.push(`Delayed emotional release appears underrepresented in this catalog — no candidates withhold resolution past the turn.`);
    } else {
      out.push(`Delayed emotional release appears rare in this catalog — only ${delayed.matchCount} of ${total} tracks qualify.`);
    }
  }

  // Cathartic resolution
  if (cathartic) {
    if (cathartic.matchCount > total * 0.40) {
      out.push(`Cathartic resolutions are common — ${cathartic.matchCount} tracks drop significantly after a strong peak.`);
    } else if (cathartic.matchCount < total * 0.08) {
      out.push(`Cathartic resolutions are uncommon in this catalog — most tracks sustain energy through the end.`);
    }
  }

  // Tonal character
  const minor = get('minor_tonality');
  const major = get('major_tonality');
  if (minor && major) {
    if (minor.matchCount > major.matchCount * 1.5) {
      out.push(`This catalog skews toward darker, minor-key tonalities — ${minor.matchCount} minor tracks vs ${major.matchCount} major.`);
    } else if (major.matchCount > minor.matchCount * 1.5) {
      out.push(`This catalog skews toward brighter, major-key tonalities — ${major.matchCount} major tracks vs ${minor.matchCount} minor.`);
    }
  } else if (minor && minor.matchCount > total * 0.55) {
    out.push(`Dark or minor tonality is the dominant character — ${minor.matchCount} of ${total} tracks.`);
  } else if (major && major.matchCount > total * 0.55) {
    out.push(`Bright or major tonality is the dominant character — ${major.matchCount} of ${total} tracks.`);
  }

  // Sustained tension
  const sustained = get('sustained_tension_through_turn');
  if (sustained) {
    if (sustained.matchCount < total * 0.12) {
      out.push(`Tracks that sustain tension through the full scene turn are rare — only ${sustained.matchCount} of ${total} qualify.`);
    } else if (sustained.matchCount > total * 0.5) {
      out.push(`More than half the catalog sustains tension through the scene turn — broad structural fit available.`);
    }
  }

  // High final intensity
  const highFinal = get('high_final_intensity');
  if (highFinal) {
    if (highFinal.matchCount > total * 0.45) {
      out.push(`High-energy resolutions are common in this catalog — ${highFinal.matchCount} tracks maintain intensity through the end.`);
    } else if (highFinal.matchCount < total * 0.08 && arc && arc.release > 55) {
      out.push(`The scene requires an elevated resolution, but few candidates maintain high final intensity.`);
    }
  }

  // Arc match quality
  const strongMatch = get('strong_arc_match');
  if (strongMatch) {
    if (strongMatch.matchCount === 0) {
      out.push(`No candidates score ≥ 70 on combined arc alignment — the scene's shape is unusual relative to this catalog.`);
    } else if (strongMatch.matchCount < total * 0.10) {
      out.push(`Fewer than 10% of candidates achieve strong arc alignment — the scene arc is a specific structural target.`);
    } else if (strongMatch.matchCount > total * 0.40) {
      out.push(`A substantial portion of the catalog achieves strong arc alignment — multiple structural fits available.`);
    }
  }

  // Scene narrative certainty
  if (arc && arc.narrativeCertainty < 0.45) {
    out.push(`Scene arc was extracted with lower confidence — constraints are approximations based on partial narrative signals.`);
  }

  return out.slice(0, 5); // cap at 5 insights
}

// ─── component ────────────────────────────────────────────────────────────────

type Props = {
  results: AnalysisResult[];
  sceneArc: SceneArc | null;
};

export function SearchAssessment({ results, sceneArc }: Props) {
  const [coverageExpanded, setCoverageExpanded] = useState(false);
  const assessment = useMemo(() => computeAssessment(results, sceneArc), [results, sceneArc]);

  if (results.length === 0) return null;
  if (assessment.constraints.length === 0) return null;

  // Sort constraints by match count descending for the coverage table
  const sortedConstraints = [...assessment.constraints].sort(
    (a, b) => b.matchCount - a.matchCount
  );

  // Show top 4 in collapsed state, all when expanded
  const visibleConstraints = coverageExpanded
    ? sortedConstraints
    : sortedConstraints.slice(0, 4);

  return (
    <div style={{ marginBottom: 28, fontFamily: SANS }}>

      {/* ── summary card ──────────────────────────────────────────────────── */}
      <div
        style={{
          borderRadius: 14,
          background: C.surface,
          border: `1px solid ${C.hairline}`,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        {/* header */}
        <div
          style={{
            padding: '14px 20px 12px',
            borderBottom: `1px solid ${C.hairline}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: C.amberDim,
                marginBottom: 3,
              }}
            >
              Search Assessment
            </div>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 'clamp(16px,1.8vw,20px)',
                color: C.silver,
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
              }}
            >
              {assessment.total.toLocaleString()} tracks analyzed
            </div>
          </div>

          {/* all-satisfied badge */}
          {assessment.allSatisfiedCount > 0 && (
            <div
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: 'rgba(34,197,94,0.08)',
                border: `1px solid rgba(34,197,94,0.20)`,
                fontSize: 11,
                color: C.green,
                fontWeight: 600,
                letterSpacing: '0.02em',
                flexShrink: 0,
              }}
            >
              {assessment.allSatisfiedCount} satisfy all constraints
            </div>
          )}
        </div>

        {/* constraint bullets */}
        <div style={{ padding: '10px 0 8px' }}>
          {sortedConstraints.map((c) => (
            <SummaryRow key={c.id} constraint={c} total={assessment.total} />
          ))}

          {/* all-satisfied line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 20px',
              borderTop: `1px solid ${C.hairline}`,
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background:
                  assessment.allSatisfiedCount > 0
                    ? 'rgba(34,197,94,0.14)'
                    : 'rgba(245,181,68,0.08)',
                border: `1.5px solid ${assessment.allSatisfiedCount > 0 ? C.green : C.amberDim}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {assessment.allSatisfiedCount > 0 ? (
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke={C.green} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span style={{ fontSize: 9, color: C.amberDim, lineHeight: 1 }}>—</span>
              )}
            </div>
            <span style={{ fontSize: 12, color: C.lavender }}>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: C.silver, fontSize: 13 }}>
                {assessment.allSatisfiedCount}
              </span>
              {' '}satisfy all identified scene constraints
              {assessment.allSatisfiedCount > 0 && (
                <span style={{ color: C.amberDim, marginLeft: 6, fontSize: 11 }}>
                  — showing {assessment.allSatisfiedCount === 1 ? 'this' : 'these'} first
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* ── constraint coverage table ──────────────────────────────────────── */}
      <div
        style={{
          borderRadius: 14,
          background: C.surface,
          border: `1px solid ${C.hairline}`,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setCoverageExpanded((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            borderBottom: coverageExpanded ? `1px solid ${C.hairline}` : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: C.amberDim,
                fontFamily: SANS,
              }}
            >
              Constraint Coverage
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: C.lavenderDim,
              }}
            >
              {assessment.constraints.length} constraints
            </span>
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            style={{
              transform: coverageExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.18s ease',
              color: C.lavenderDim,
            }}
          >
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {coverageExpanded && (
          <>
            {/* table header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 110px 72px',
                gap: 8,
                padding: '8px 20px',
                borderBottom: `1px solid ${C.hairline}`,
              }}
            >
              {(['Constraint', 'Tracks Matching', 'Coverage'] as const).map((h) => (
                <div
                  key={h}
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: C.lavenderDim,
                    textAlign: h === 'Constraint' ? 'left' : 'right',
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* rows */}
            {visibleConstraints.map((c) => (
              <CoverageRow key={c.id} constraint={c} />
            ))}

            {/* show more / less */}
            {sortedConstraints.length > 4 && (
              <button
                type="button"
                onClick={() => setCoverageExpanded((v) => !v)}
                style={{
                  width: '100%',
                  padding: '9px 20px',
                  background: 'transparent',
                  border: 0,
                  borderTop: `1px solid ${C.hairline}`,
                  cursor: 'pointer',
                  fontSize: 11,
                  color: C.amberDim,
                  textAlign: 'center',
                }}
              >
                Show fewer constraints
              </button>
            )}
          </>
        )}

        {!coverageExpanded && (
          <div style={{ padding: '0 0 2px' }}>
            {visibleConstraints.map((c) => (
              <CoverageRow key={c.id} constraint={c} compact />
            ))}
            {sortedConstraints.length > 4 && (
              <button
                type="button"
                onClick={() => setCoverageExpanded(true)}
                style={{
                  width: '100%',
                  padding: '9px 20px',
                  background: 'transparent',
                  border: 0,
                  borderTop: `1px solid ${C.hairline}`,
                  cursor: 'pointer',
                  fontSize: 11,
                  color: C.amberDim,
                  textAlign: 'center',
                }}
              >
                Show all {sortedConstraints.length} constraints
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── search insights ────────────────────────────────────────────────── */}
      {assessment.insights.length > 0 && (
        <div
          style={{
            borderRadius: 14,
            background: C.surface,
            border: `1px solid ${C.hairline}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 20px 10px',
              borderBottom: `1px solid ${C.hairline}`,
            }}
          >
            <span
              style={{
                fontSize: 10,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: C.amberDim,
              }}
            >
              Search Insights
            </span>
          </div>
          <div style={{ padding: '8px 0 6px' }}>
            {assessment.insights.map((insight, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '7px 20px',
                  alignItems: 'flex-start',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = C.surfaceHover;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: C.amber,
                    marginTop: 7,
                    flexShrink: 0,
                    opacity: 0.7,
                  }}
                />
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: C.lavender,
                    lineHeight: 1.6,
                    fontFamily: SANS,
                  }}
                >
                  {insight}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── summary row (inside the summary card) ────────────────────────────────────

function SummaryRow({
  constraint,
  total,
}: {
  constraint: ConstraintResult;
  total: number;
}) {
  const { matchCount, label } = constraint;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 20px',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = C.surfaceAlt;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 13,
          fontWeight: 700,
          color: matchCount > 0 ? C.silver : C.lavenderDim,
          minWidth: 36,
          flexShrink: 0,
        }}
      >
        {matchCount.toLocaleString()}
      </span>
      <span style={{ fontSize: 12, color: C.lavender }}>
        {describeConstraint(label, matchCount, total)}
      </span>
    </div>
  );
}

/** Generates a natural-language line for each constraint in the summary card. */
function describeConstraint(label: string, count: number, total: number): string {
  const map: Record<string, (n: number) => string> = {
    'Low early energy':              (n) => `${n === 1 ? 'track opens' : 'tracks open'} with low early energy`,
    'Sustained build':               (n) => `${n === 1 ? 'track builds' : 'tracks build'} steadily through the first act`,
    'Sustained tension through turn':(n) => `${n === 1 ? 'track sustains' : 'tracks sustain'} tension through the scene turn`,
    'Emotional peak at the turn':    (n) => `${n === 1 ? 'track reaches' : 'tracks reach'} peak at the scene turn`,
    'Emotional peak after turn':     (n) => `${n === 1 ? 'track climaxes' : 'tracks climax'} at or after the turn`,
    'Delayed emotional release':     (n) => `${n === 1 ? 'track delays' : 'tracks delay'} emotional release past the turn`,
    'High final intensity':          (n) => `${n === 1 ? 'track resolves' : 'tracks resolve'} at high intensity`,
    'Cathartic resolution':          (n) => `${n === 1 ? 'track drops' : 'tracks drop'} significantly after the peak`,
    'Negative opening valence':      (n) => `${n === 1 ? 'track opens' : 'tracks open'} with dark or conflicted valence`,
    'Positive valence at resolution':(n) => `${n === 1 ? 'track resolves' : 'tracks resolve'} with upward emotional direction`,
    'Valence arc aligned':           (n) => `${n === 1 ? 'track aligns' : 'tracks align'} emotionally with the scene`,
    'Minor or dark tonality':        (n) => `${n === 1 ? 'track uses' : 'tracks use'} minor or dark tonality`,
    'Major or bright tonality':      (n) => `${n === 1 ? 'track uses' : 'tracks use'} major or bright tonality`,
    'High overall energy':           (n) => `${n === 1 ? 'track carries' : 'tracks carry'} high overall energy`,
    'Low or restrained energy':      (n) => `${n === 1 ? 'track is' : 'tracks are'} low or restrained in energy`,
    'Strong arc match':              (n) => `${n === 1 ? 'track scores' : 'tracks score'} ≥ 70 on arc alignment`,
  };
  const fn = map[label];
  return fn ? fn(count) : `${count === 1 ? 'track matches' : 'tracks match'} ${label.toLowerCase()}`;
}

// ─── coverage row (inside the coverage table) ─────────────────────────────────

function CoverageRow({
  constraint,
  compact = false,
}: {
  constraint: ConstraintResult;
  compact?: boolean;
}) {
  const { label, description, matchCount, total, pct } = constraint;

  const barColor =
    pct >= 40 ? C.green :
    pct >= 15 ? C.amber :
    pct > 0   ? C.orange :
    C.red;

  if (compact) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 70px 54px',
          gap: 8,
          padding: '9px 20px',
          alignItems: 'center',
          borderBottom: `1px solid ${C.hairline}`,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = C.surfaceAlt;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.silver }}>{label}</div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12, color: matchCount > 0 ? C.silver : C.lavenderDim }}>
          {matchCount.toLocaleString()} / {total.toLocaleString()}
        </div>
        <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12, color: barColor }}>
          {pct}%
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '10px 20px',
        borderBottom: `1px solid ${C.hairline}`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = C.surfaceAlt;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 110px 72px',
          gap: 8,
          alignItems: 'center',
          marginBottom: 5,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.silver, marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 11, color: C.lavenderDim }}>{description}</div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12, color: matchCount > 0 ? C.silver : C.lavenderDim }}>
          {matchCount.toLocaleString()} / {total.toLocaleString()}
        </div>
        <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 13, fontWeight: 600, color: barColor }}>
          {pct}%
        </div>
      </div>

      {/* fill bar */}
      <div
        style={{
          height: 3,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.min(pct, 100)}%`,
            background: barColor,
            borderRadius: 2,
            opacity: 0.7,
            transition: 'width 0.35s ease',
          }}
        />
      </div>
    </div>
  );
}
