/**
 * CandidateArcRail — horizontal scrollable track selector.
 *
 * Each chip shows the track's arc match quality and lets the supervisor
 * switch focus between candidate tracks. The primary signal is fit quality,
 * not an opaque number — pass/partial/fail is the primary glyph.
 */

import { ArcSparkline } from './ArcSparkline';
import type { AnalysisResult, SceneArc } from '../utils/apiClient';

const C = {
  magenta:  '#DB2777',
  amber:    '#F5B544',
  lavender: '#9B93C4',
  silver:   '#F4F2FA',
  good:     '#4CAF82',
  bad:      '#E85A5A',
  hairline: 'rgba(123,112,178,0.14)',
  bg:       'rgba(7,4,26,0.60)',
};

const SANS  = '"Manrope", system-ui, sans-serif';
const MONO  = '"JetBrains Mono", monospace';
const SERIF = '"Instrument Serif", Georgia, serif';

function cleanTitle(raw: string): string {
  let t = raw
    .replace(/^[0-9a-f]{6,}_/i, '')
    .replace(/_/g, ' ')
    .replace(/\.(mp3|wav|flac|aiff?)$/i, '')
    .replace(/\b(Official\s+Video|Official\s+Audio|Lyric\s+Video|HD|HQ|4K|Audio|Video|background\s+vocals?\s*\d*)\b/gi, '')
    .replace(/\s+\d{1,3}\s*$/, '')
    .replace(/\s{2,}/g, ' ').trim();
  if (t.includes(' - ')) t = t.slice(t.indexOf(' - ') + 3).trim();
  return t || raw;
}

type FitTier = 'pass' | 'partial' | 'fail';

function fitTier(result: AnalysisResult): FitTier {
  const score = result.confidenceScore.arcMatch?.combinedScore ?? result.confidenceScore.score;
  return score >= 72 ? 'pass' : score >= 48 ? 'partial' : 'fail';
}

function tierColor(tier: FitTier): string {
  return tier === 'pass' ? C.good : tier === 'partial' ? C.amber : C.bad;
}

function tierLabel(tier: FitTier): string {
  return tier === 'pass' ? 'Fits' : tier === 'partial' ? 'Partial' : 'Fails';
}

type Props = {
  results: AnalysisResult[];
  sceneArc: SceneArc | null;
  selectedIdx: number;
  onSelect: (i: number) => void;
};

export function CandidateArcRail({ results, sceneArc, selectedIdx, onSelect }: Props) {
  if (results.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, fontFamily: SANS }}>
          Candidate Tracks
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(155,147,196,0.50)' }}>
          {results.length} {results.length === 1 ? 'track' : 'tracks'}
        </span>
      </div>

      {/* scrollable chip row */}
      <div style={{
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        paddingBottom: 6,
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        {results.map((r, i) => {
          const tier     = fitTier(r);
          const color    = tierColor(tier);
          const label    = tierLabel(tier);
          const selected = i === selectedIdx;
          const title    = cleanTitle(r.track.title);
          const hasCurve = Boolean(r.confidenceScore.songArcCurve?.length);
          const score    = r.confidenceScore.arcMatch?.combinedScore ?? r.confidenceScore.score;

          return (
            <button
              key={r.track.id}
              onClick={() => onSelect(i)}
              style={{
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 12,
                background: selected ? `${color}12` : C.bg,
                border: selected ? `1.5px solid ${color}45` : `1px solid ${C.hairline}`,
                borderLeft: selected ? `3px solid ${color}` : undefined,
                cursor: 'pointer',
                outline: 'none',
                minWidth: 120,
                maxWidth: 150,
                textAlign: 'left',
                transition: 'background 0.12s, border-color 0.12s',
                WebkitTapHighlightColor: 'transparent',
              }}
              aria-pressed={selected}
              aria-label={`${title} — ${label}`}
            >
              {/* sparkline */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {hasCurve ? (
                  <ArcSparkline
                    curve={r.confidenceScore.songArcCurve!}
                    sceneArc={sceneArc}
                    size={{ w: 88, h: 30 }}
                  />
                ) : (
                  <div style={{ width: 88, height: 30, borderRadius: 4, background: 'rgba(123,112,178,0.06)', border: '1px solid rgba(123,112,178,0.10)' }} />
                )}
              </div>

              {/* title */}
              <div style={{
                fontSize: 11, fontWeight: 600, color: C.silver,
                letterSpacing: '-0.005em', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
                fontFamily: SANS,
              }}>
                {title}
              </div>

              {/* tier badge + score */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                  textTransform: 'uppercase', color,
                  fontFamily: SANS,
                }}>
                  {label}
                </span>
                <span style={{
                  fontFamily: MONO, fontSize: 10, color: selected ? color : 'rgba(155,147,196,0.50)',
                  fontWeight: 700,
                }}>
                  {score}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
