/**
 * SCDEPanel — Scene Constraint Diagnostic Engine.
 *
 * Shows why only N songs survive the scene requirements:
 * feasible set size, bottleneck constraint, entropy collapse,
 * and sensitivity analysis.
 *
 * SCDE is secondary to narrative fit — it explains the catalog
 * narrowing, not the creative match.
 */

import type { AnalysisResult } from '../utils/apiClient';

const C = {
  magenta:  '#DB2777',
  amber:    '#F5B544',
  lavender: '#9B93C4',
  silver:   '#F4F2FA',
  good:     '#4CAF82',
  bad:      '#E85A5A',
  hairline: 'rgba(123,112,178,0.13)',
  bg:       'rgba(7,4,26,0.60)',
};

const SANS  = '"Manrope", system-ui, sans-serif';
const MONO  = '"JetBrains Mono", monospace';
const SERIF = '"Instrument Serif", Georgia, serif';

type ConstraintBucket = {
  key: string;
  label: string;
  removed: number;
  description: string;
};

export function computeSCDE(results: AnalysisResult[]) {
  const total = results.length;

  // Tracks that pass narrative fit threshold
  const feasible = results.filter(r => {
    const score = r.confidenceScore.arcMatch?.combinedScore ?? r.confidenceScore.score;
    return score >= 50;
  });

  // Per-constraint failure counts (a track can fail multiple constraints)
  const arcFails     = results.filter(r => (r.confidenceScore.arcMatch?.combinedScore ?? r.confidenceScore.score) < 50).length;
  const sceneFails   = results.filter(r => r.confidenceScore.vector.scene < 0.50).length;
  const lyricsFails  = results.filter(r => r.confidenceScore.vector.lyrics < 0.40 && r.confidenceScore.vector.lyrics > 0).length;
  const rightsFails  = results.filter(r => r.confidenceScore.vector.rightsClarity < 0.35).length;
  const signalFails  = results.filter(r => r.confidenceScore.vector.audioSignal < 0.35).length;

  const buckets: ConstraintBucket[] = [
    {
      key: 'arc',
      label: 'Narrative arc divergence',
      removed: arcFails,
      description: 'Song arc does not follow the scene\'s emotional shape.',
    },
    {
      key: 'scene',
      label: 'Scene fit',
      removed: sceneFails,
      description: 'PAD emotional profile misses the brief target zone.',
    },
    {
      key: 'rights',
      label: 'Rights clearance',
      removed: rightsFails,
      description: 'Insufficient clearance data to confirm availability.',
    },
    {
      key: 'lyrics',
      label: 'Lyrics alignment',
      removed: lyricsFails,
      description: 'Lyric vocabulary does not overlap with scene themes.',
    },
    {
      key: 'signal',
      label: 'Audio signal',
      removed: signalFails,
      description: 'Spectral profile (tension / intimacy) misses target window.',
    },
  ].filter(b => b.removed > 0).sort((a, b) => b.removed - a.removed);

  const bottleneck = buckets[0] ?? null;
  const collapsePct = total > 0 ? Math.round((1 - feasible.length / total) * 100) : 0;
  const sensitivityTarget = bottleneck ? Math.min(total, feasible.length + Math.ceil(bottleneck.removed * 0.6)) : feasible.length;

  return { total, feasibleCount: feasible.length, buckets, bottleneck, collapsePct, sensitivityTarget };
}

type Props = {
  results: AnalysisResult[];
};

export function SCDEPanel({ results }: Props) {
  if (results.length === 0) return null;

  const { total, feasibleCount, buckets, bottleneck, collapsePct, sensitivityTarget } = computeSCDE(results);

  const funnelBarMaxW = 280;
  const passFraction  = total > 0 ? feasibleCount / total : 0;

  return (
    <div style={{
      borderRadius: 14,
      background: C.bg,
      border: `1px solid ${C.hairline}`,
      padding: '18px 20px',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, fontFamily: SANS, marginBottom: 4 }}>
            Scene Constraint Diagnostic
          </div>
          <div style={{ fontSize: 15, color: C.silver, fontFamily: SANS, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Why only{' '}
            <span style={{ color: C.amber }}>{feasibleCount}</span>
            {' '}of{' '}
            <span style={{ color: C.lavender }}>{total}</span>
            {' '}{total === 1 ? 'track' : 'tracks'} {feasibleCount === 1 ? 'qualifies' : 'qualify'}
          </div>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: C.bad, letterSpacing: '-0.01em' }}>
            {collapsePct}%
          </span>
          <span style={{ fontSize: 8.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(155,147,196,0.45)', fontFamily: SANS }}>
            entropy collapse
          </span>
        </div>
      </div>

      {/* feasibility funnel bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: C.lavender, fontFamily: SANS, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
            Feasible set
          </span>
          <div style={{
            flex: 1, height: 8, borderRadius: 4,
            background: 'rgba(123,112,178,0.10)',
            border: '1px solid rgba(123,112,178,0.12)',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${passFraction * 100}%`,
              height: '100%',
              borderRadius: 4,
              background: feasibleCount === 0
                ? C.bad
                : feasibleCount < total / 2
                  ? `linear-gradient(90deg, ${C.amber}, ${C.good})`
                  : `linear-gradient(90deg, ${C.good}, ${C.good})`,
              transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.amber, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {feasibleCount} / {total}
          </span>
        </div>
      </div>

      {/* constraint breakdown */}
      {buckets.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.lavender, fontFamily: SANS, marginBottom: 10 }}>
            Constraint breakdown
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {buckets.map((b, i) => {
              const isBottleneck = i === 0;
              const barW = total > 0 ? (b.removed / total) * funnelBarMaxW : 0;
              const barColor = isBottleneck ? C.bad : C.amber;
              return (
                <div key={b.key}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3,
                  }}>
                    {isBottleneck && (
                      <span style={{
                        fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: C.bad, fontFamily: SANS, fontWeight: 700,
                        background: 'rgba(232,90,90,0.12)', border: '1px solid rgba(232,90,90,0.30)',
                        borderRadius: 4, padding: '1px 5px',
                      }}>
                        Bottleneck
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: C.silver, fontFamily: SANS, fontWeight: 600 }}>
                      {b.label}
                    </span>
                    <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, color: barColor, fontWeight: 700 }}>
                      −{b.removed}
                    </span>
                  </div>
                  <div style={{
                    height: 5, borderRadius: 3,
                    background: 'rgba(123,112,178,0.09)',
                    border: '1px solid rgba(123,112,178,0.10)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${(b.removed / total) * 100}%`,
                      height: '100%',
                      borderRadius: 3,
                      background: barColor,
                      opacity: 0.75,
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(155,147,196,0.55)', fontFamily: SANS, marginTop: 3 }}>
                    {b.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* bottleneck plain-language statement */}
      {bottleneck && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(232,90,90,0.07)',
          border: '1px solid rgba(232,90,90,0.18)',
          marginBottom: 12,
        }}>
          <span style={{ fontSize: 12, color: C.silver, fontFamily: SANS, lineHeight: 1.5 }}>
            <strong style={{ color: C.bad, fontWeight: 700 }}>{bottleneck.label}</strong>
            {' '}is the primary constraint — removing {bottleneck.removed} track{bottleneck.removed !== 1 ? 's' : ''} from the qualified set.
          </span>
        </div>
      )}

      {/* sensitivity analysis */}
      {bottleneck && sensitivityTarget > feasibleCount && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(245,181,68,0.06)',
          border: '1px solid rgba(245,181,68,0.18)',
        }}>
          <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.amber, fontFamily: SANS, marginBottom: 4 }}>
            Sensitivity Analysis
          </div>
          <span style={{ fontSize: 12, color: C.silver, fontFamily: SANS, lineHeight: 1.5 }}>
            If <strong style={{ color: C.amber }}>{bottleneck.label}</strong> were resolved,
            up to <strong style={{ color: C.amber }}>{sensitivityTarget}</strong> tracks would qualify —
            a {Math.round(((sensitivityTarget - feasibleCount) / Math.max(feasibleCount, 1)) * 100)}% increase in the feasible set.
          </span>
        </div>
      )}

      {/* all qualify */}
      {feasibleCount === total && total > 0 && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(76,175,130,0.08)',
          border: '1px solid rgba(76,175,130,0.22)',
        }}>
          <span style={{ fontSize: 12, color: C.silver, fontFamily: SANS, lineHeight: 1.5 }}>
            All {total} {total === 1 ? 'track' : 'tracks'} pass scene constraints.
            No bottleneck identified — catalog entropy is low.
          </span>
        </div>
      )}
    </div>
  );
}
