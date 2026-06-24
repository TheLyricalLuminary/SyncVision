/**
 * GapReport — catalog-level constraint diagnostic.
 *
 * Appears BEFORE any track result. Not "how good is this track."
 * "Does a solution exist in this catalog?"
 *
 * Negative certainty is the most valuable output:
 *   "No candidates found that sustain tension through final turn."
 *   That tells a supervisor to broaden the search — before they've
 *   spent 20 minutes auditioning songs that can't work.
 */

import type { SceneArc, AnalysisResult } from '../utils/apiClient';

// ─── design tokens (mirrored from ResultsScreen) ─────────────────────────────
const C = {
  bg:           '#0F0823',
  surface:      '#130B2B',
  surfaceAlt:   'rgba(255,255,255,0.03)',
  hairline:     'rgba(255,255,255,0.08)',
  hairlineStrong:'rgba(255,255,255,0.14)',
  amber:        '#F5B544',
  magenta:      '#DB2777',
  purple:       '#7B70B2',
  lavender:     '#9B93C4',
  silver:       '#E8E4F0',
  green:        '#22C55E',
  orange:       '#F97316',
  red:          '#EF4444',
};
const SANS  = '"Inter", system-ui, sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO  = '"JetBrains Mono", monospace';

// ─── constraint definitions ───────────────────────────────────────────────────

export type Constraint = {
  id: string;
  label: string;
  description: string;
  /** Returns true if a given songArcCurve satisfies this constraint */
  test: (curve: number[]) => boolean;
  /** Why this constraint was derived — shown in UI */
  derivedFrom: string;
};

/**
 * Derive scene constraints from the scene arc shape.
 * Each constraint describes something the scene structurally requires.
 * Only derives constraints where the scene arc clearly signals the need.
 */
export function deriveSceneConstraints(arc: SceneArc): Constraint[] {
  const constraints: Constraint[] = [];

  // opening: arc[0], heldBreath: arc[1], turn: arc[2], release: arc[3]
  // songArcCurve is [opening, heldBreath, turn, release] each 0–1

  // Low opening — scene starts quiet, needs track to start restrained
  if (arc.opening < 35) {
    constraints.push({
      id: 'low_opening',
      label: 'Restrained opening',
      description: `Starts below ${arc.opening} intensity — track must open quietly`,
      derivedFrom: `Scene opening: ${arc.opening}`,
      test: (c) => c[0] <= 0.45,
    });
  }

  // Sustained build — scene climbs meaningfully from open to held-breath
  if (arc.heldBreath - arc.opening > 22) {
    constraints.push({
      id: 'sustained_build',
      label: 'Sustained build',
      description: 'Track must build steadily through the held-breath phase',
      derivedFrom: `Opening→Held-breath rise: +${arc.heldBreath - arc.opening} pts`,
      test: (c) => c[1] > c[0] + 0.14,
    });
  }

  // High tension at turn — scene demands a clear emotional peak
  if (arc.turn > 68) {
    constraints.push({
      id: 'high_tension_turn',
      label: 'Peak at the turn',
      description: 'Track must reach high intensity at the scene's emotional turn',
      derivedFrom: `Scene turn: ${arc.turn}`,
      test: (c) => c[2] >= 0.62,
    });
  }

  // Delayed release — release is below turn by a meaningful margin
  if (arc.turn - arc.release > 20) {
    constraints.push({
      id: 'delayed_release',
      label: 'Delayed resolution',
      description: 'Track must not resolve early — tension must hold through the turn',
      derivedFrom: `Turn→Release drop: −${arc.turn - arc.release} pts`,
      test: (c) => c[3] < c[2] - 0.14,
    });
  }

  // Cathartic drop — release is dramatically lower than turn (emotional exhale)
  if (arc.turn - arc.release > 38) {
    constraints.push({
      id: 'cathartic_release',
      label: 'Cathartic resolution',
      description: 'Track must drop significantly after the turn — strong emotional exhale',
      derivedFrom: `Turn→Release drop: −${arc.turn - arc.release} pts`,
      test: (c) => c[3] < c[2] - 0.32,
    });
  }

  // Held breath tension — scene asks for tension to stay high before the turn
  if (arc.heldBreath > 60 && arc.heldBreath >= arc.opening + 15) {
    constraints.push({
      id: 'held_tension',
      label: 'Held tension',
      description: 'Track must sustain elevated intensity through the held-breath phase',
      derivedFrom: `Held-breath: ${arc.heldBreath}`,
      test: (c) => c[1] >= 0.52,
    });
  }

  // Low release — scene ends quietly (aftermath, reflection, unresolved)
  if (arc.release < 28) {
    constraints.push({
      id: 'quiet_ending',
      label: 'Quiet ending',
      description: 'Track must end at low intensity — scene closes in stillness',
      derivedFrom: `Scene release: ${arc.release}`,
      test: (c) => c[3] <= 0.32,
    });
  }

  return constraints;
}

// ─── gap report computation ───────────────────────────────────────────────────

export type ConstraintResult = Constraint & {
  satisfiedCount: number;
  totalCount: number;
  fraction: number; // 0–1
};

export type GapReportData = {
  constraints: ConstraintResult[];
  totalCandidates: number;
  allSatisfiedCount: number;
  gapConstraints: ConstraintResult[]; // constraints that nothing satisfies
  coveragePercent: number;
};

export function computeGapReport(
  results: AnalysisResult[],
  arc: SceneArc
): GapReportData {
  const constraints = deriveSceneConstraints(arc);
  const total = results.length;

  const constraintResults: ConstraintResult[] = constraints.map((c) => {
    let count = 0;
    for (const r of results) {
      const curve = r.confidenceScore.songArcCurve;
      if (curve && curve.length >= 4 && c.test(curve)) count++;
    }
    return {
      ...c,
      satisfiedCount: count,
      totalCount: total,
      fraction: total > 0 ? count / total : 0,
    };
  });

  // Tracks that satisfy ALL constraints
  let allSatisfied = 0;
  if (constraints.length > 0) {
    for (const r of results) {
      const curve = r.confidenceScore.songArcCurve;
      if (curve && curve.length >= 4) {
        if (constraints.every((c) => c.test(curve))) allSatisfied++;
      }
    }
  } else {
    allSatisfied = total; // no constraints derived → all pass trivially
  }

  const gapConstraints = constraintResults.filter((c) => c.satisfiedCount === 0);

  return {
    constraints: constraintResults,
    totalCandidates: total,
    allSatisfiedCount: allSatisfied,
    gapConstraints,
    coveragePercent: total > 0 ? Math.round((allSatisfied / total) * 100) : 0,
  };
}

// ─── component ────────────────────────────────────────────────────────────────

type Props = {
  results: AnalysisResult[];
  sceneArc: SceneArc;
};

export function GapReport({ results, sceneArc }: Props) {
  const report = computeGapReport(results, sceneArc);

  if (report.constraints.length === 0) {
    return null; // scene arc didn't yield meaningful constraints
  }

  const coverageFill =
    report.coveragePercent >= 60
      ? C.green
      : report.coveragePercent >= 25
      ? C.amber
      : C.red;

  return (
    <div
      style={{
        marginBottom: 28,
        borderRadius: 14,
        background: C.surface,
        border: `1px solid ${C.hairline}`,
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <div
        style={{
          padding: '16px 20px 14px',
          borderBottom: `1px solid ${C.hairline}`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: C.amber,
              marginBottom: 5,
              fontFamily: SANS,
            }}
          >
            Catalog Diagnostic
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(17px,2vw,22px)',
              color: C.silver,
              lineHeight: 1.1,
              letterSpacing: '-0.01em',
            }}
          >
            Gap Report
          </div>
          <div
            style={{
              fontSize: 12,
              color: C.lavender,
              marginTop: 5,
              fontFamily: SANS,
              opacity: 0.85,
            }}
          >
            {report.totalCandidates} candidate{report.totalCandidates !== 1 ? 's' : ''} analyzed against{' '}
            {report.constraints.length} scene requirement{report.constraints.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* coverage pill */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 3,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 28,
              fontWeight: 700,
              color: coverageFill,
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}
          >
            {report.allSatisfiedCount}
            <span
              style={{
                fontSize: 13,
                fontWeight: 400,
                color: C.lavender,
                letterSpacing: 0,
              }}
            >
              /{report.totalCandidates}
            </span>
          </div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: C.lavender,
              fontFamily: SANS,
            }}
          >
            satisfy all requirements
          </div>
        </div>
      </div>

      {/* constraint rows */}
      <div style={{ padding: '10px 0 4px' }}>
        {report.constraints.map((c) => (
          <ConstraintRow key={c.id} constraint={c} />
        ))}
      </div>

      {/* negative certainty — the most important section */}
      {report.gapConstraints.length > 0 && (
        <NegativeCertainty gaps={report.gapConstraints} total={report.totalCandidates} />
      )}

      {report.gapConstraints.length === 0 && report.allSatisfiedCount === 0 && (
        <div
          style={{
            margin: '0 16px 14px',
            padding: '12px 14px',
            borderRadius: 8,
            background: 'rgba(249,115,22,0.07)',
            border: `1px solid rgba(249,115,22,0.18)`,
            fontSize: 12,
            color: C.orange,
            fontFamily: SANS,
            lineHeight: 1.6,
          }}
        >
          Every constraint has at least one candidate, but no single track satisfies all of them.
          Consider prioritizing the constraints most critical to the scene.
        </div>
      )}

      {report.gapConstraints.length === 0 && report.allSatisfiedCount > 0 && (
        <div
          style={{
            margin: '0 16px 14px',
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(34,197,94,0.06)',
            border: `1px solid rgba(34,197,94,0.15)`,
            fontSize: 12,
            color: C.green,
            fontFamily: SANS,
          }}
        >
          {report.allSatisfiedCount} track{report.allSatisfiedCount !== 1 ? 's' : ''} satisfy every scene requirement.
        </div>
      )}
    </div>
  );
}

// ─── constraint row ───────────────────────────────────────────────────────────

function ConstraintRow({ constraint }: { constraint: ConstraintResult }) {
  const { satisfiedCount, totalCount, fraction } = constraint;
  const pct = Math.round(fraction * 100);

  const fillColor =
    fraction >= 0.5
      ? C.green
      : fraction >= 0.2
      ? C.amber
      : fraction > 0
      ? C.orange
      : C.red;

  const iconColor =
    fraction >= 0.5 ? C.green : fraction > 0 ? C.amber : C.red;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 20px',
        borderRadius: 0,
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = C.surfaceAlt;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* status icon */}
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: `1.5px solid ${iconColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background:
            fraction > 0 ? `${iconColor}18` : 'rgba(239,68,68,0.10)',
        }}
      >
        {fraction > 0 ? (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke={iconColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path d="M3 3l4 4M7 3l-4 4" stroke={C.red} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {/* label + derived from */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.silver,
            fontFamily: SANS,
            lineHeight: 1.3,
          }}
        >
          {constraint.label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: C.lavender,
            opacity: 0.75,
            fontFamily: SANS,
            marginTop: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {constraint.derivedFrom}
        </div>
      </div>

      {/* fill bar */}
      <div style={{ width: 80, flexShrink: 0 }}>
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.07)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: fillColor,
              borderRadius: 2,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* count */}
      <div
        style={{
          flexShrink: 0,
          textAlign: 'right',
          minWidth: 52,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 600,
            color: fraction > 0 ? C.silver : C.red,
          }}
        >
          {satisfiedCount}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: C.lavender,
            opacity: 0.65,
          }}
        >
          /{totalCount}
        </span>
      </div>
    </div>
  );
}

// ─── negative certainty section ───────────────────────────────────────────────

function NegativeCertainty({
  gaps,
  total,
}: {
  gaps: ConstraintResult[];
  total: number;
}) {
  return (
    <div
      style={{
        margin: '4px 16px 14px',
        borderRadius: 10,
        background: 'rgba(239,68,68,0.05)',
        border: `1px solid rgba(239,68,68,0.18)`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px 8px',
          borderBottom: `1px solid rgba(239,68,68,0.12)`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke={C.red} strokeWidth="1.4" />
          <path d="M8 5v3.5" stroke={C.red} strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.8" fill={C.red} />
        </svg>
        <span
          style={{
            fontSize: 10,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: C.red,
            fontFamily: SANS,
            fontWeight: 600,
          }}
        >
          No candidates found
        </span>
      </div>

      <div style={{ padding: '8px 14px 10px' }}>
        {gaps.map((g) => (
          <div
            key={g.id}
            style={{
              fontSize: 13,
              color: C.silver,
              fontFamily: SANS,
              lineHeight: 1.55,
              paddingTop: 4,
              paddingBottom: 4,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <span
              style={{
                color: C.red,
                marginTop: 1,
                flexShrink: 0,
                fontSize: 16,
                lineHeight: 1.1,
              }}
            >
              ×
            </span>
            <span>
              <strong style={{ color: C.silver }}>{g.label}</strong>
              <span style={{ color: C.lavender, fontSize: 12 }}>
                {' '}— {g.description}
              </span>
            </span>
          </div>
        ))}

        <div
          style={{
            marginTop: 10,
            paddingTop: 9,
            borderTop: `1px solid rgba(239,68,68,0.12)`,
            fontSize: 12,
            color: C.lavender,
            fontFamily: SANS,
            lineHeight: 1.6,
            opacity: 0.9,
          }}
        >
          {gaps.length === 1
            ? `None of the ${total} candidate${total !== 1 ? 's' : ''} satisfies this requirement. Consider broadening the search or revising the scene brief.`
            : `None of the ${total} candidate${total !== 1 ? 's' : ''} satisfies ${gaps.length === gaps.length ? 'these' : 'any of these'} requirements. The catalog may not contain a solution for this scene as written.`}
        </div>
      </div>
    </div>
  );
}
