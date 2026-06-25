/**
 * NarrativeFitVerdict — plain-language match explanation.
 *
 * Never uses opaque scores. Explains in trade-language sentences
 * why a song fits or fails the scene's emotional arc.
 */

import type { SceneArc, ArcMatchResult } from '../utils/apiClient';
import { computeDivergenceSegments } from './NarrativeArcCanvas';

const C = {
  magenta:  '#DB2777',
  amber:    '#F5B544',
  lavender: '#9B93C4',
  silver:   '#F4F2FA',
  good:     '#4CAF82',
  bad:      '#E85A5A',
  hairline: 'rgba(123,112,178,0.13)',
  bg:       'rgba(7,4,26,0.65)',
};

const SANS  = '"Manrope", system-ui, sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';

type Props = {
  sceneArc: SceneArc | null;
  songArcCurve: number[];
  arcMatch?: ArcMatchResult;
  trackTitle: string;
};

export function NarrativeFitVerdict({ sceneArc, songArcCurve, arcMatch, trackTitle }: Props) {
  const segments = computeDivergenceSegments(sceneArc, songArcCurve.slice(0, 4));
  const passes   = segments.filter(s => s.severity === 'ok');
  const warns    = segments.filter(s => s.severity === 'warn');
  const fails    = segments.filter(s => s.severity === 'fail');

  const overallVerdict: 'pass' | 'partial' | 'fail' =
    arcMatch
      ? arcMatch.combinedScore >= 72 ? 'pass'
        : arcMatch.combinedScore >= 48 ? 'partial'
        : 'fail'
      : fails.length >= 2 ? 'fail'
        : fails.length === 0 && warns.length <= 1 ? 'pass'
        : 'partial';

  const verdictColor =
    overallVerdict === 'pass' ? C.good :
    overallVerdict === 'partial' ? C.amber : C.bad;

  const verdictLabel =
    overallVerdict === 'pass'    ? 'Narrative fit confirmed' :
    overallVerdict === 'partial' ? 'Partial narrative fit' :
    'Narrative mismatch';

  const clean = (raw: string) => {
    let t = raw
      .replace(/^[0-9a-f]{6,}_/i, '')
      .replace(/_/g, ' ')
      .replace(/\.(mp3|wav|flac|aiff?)$/i, '')
      .replace(/\b(Official\s+Video|Official\s+Audio|Lyric\s+Video|HD|HQ|4K|Audio|Video)\b/gi, '')
      .replace(/\s{2,}/g, ' ').trim();
    if (t.includes(' - ')) t = t.slice(t.indexOf(' - ') + 3).trim();
    return t || raw;
  };

  const title = clean(trackTitle);

  return (
    <div style={{
      borderRadius: 14,
      background: C.bg,
      border: `1px solid ${C.hairline}`,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>
      {/* eyebrow */}
      <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, fontFamily: SANS, marginBottom: 10 }}>
        Narrative Fit Explanation
      </div>

      {/* verdict banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
        padding: '8px 12px',
        borderRadius: 8,
        background: `${verdictColor}14`,
        border: `1px solid ${verdictColor}30`,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: verdictColor,
          letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS,
        }}>
          {verdictLabel}
        </span>
        {arcMatch && (
          <span style={{
            marginLeft: 'auto', fontFamily: '"JetBrains Mono",monospace',
            fontSize: 11, color: verdictColor, fontWeight: 700,
          }}>
            {arcMatch.combinedScore}
          </span>
        )}
      </div>

      {/* pass / success reasons */}
      {passes.length > 0 && (
        <div style={{ marginBottom: fails.length > 0 ? 14 : 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: C.silver,
            letterSpacing: '-0.005em', fontFamily: SANS, marginBottom: 8,
          }}>
            <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, color: C.lavender, marginRight: 4 }}>
              {title}
            </span>
            succeeds because:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {passes.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                  flexShrink: 0, width: 16, height: 16, borderRadius: 999,
                  background: `${C.good}20`, border: `1px solid ${C.good}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 1,
                }}>
                  <svg width="8" height="8" viewBox="0 0 8 8">
                    <polyline points="1.5,4 3,5.5 6.5,2" stroke={C.good} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={{ fontSize: 12, color: C.silver, lineHeight: 1.5, fontFamily: SANS }}>
                  {s.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* warn reasons */}
      {warns.length > 0 && (
        <div style={{ marginBottom: fails.length > 0 ? 14 : 0, marginTop: passes.length > 0 ? 14 : 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: C.silver,
            letterSpacing: '-0.005em', fontFamily: SANS, marginBottom: 8,
          }}>
            Watch points:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {warns.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                  flexShrink: 0, width: 16, height: 16, borderRadius: 999,
                  background: `${C.amber}18`, border: `1px solid ${C.amber}50`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 1,
                }}>
                  <svg width="8" height="8" viewBox="0 0 8 8">
                    <line x1="4" y1="1.5" x2="4" y2="5" stroke={C.amber} strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="4" cy="6.5" r="0.8" fill={C.amber} />
                  </svg>
                </div>
                <span style={{ fontSize: 12, color: C.silver, lineHeight: 1.5, fontFamily: SANS }}>
                  {s.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* fail reasons */}
      {fails.length > 0 && (
        <div style={{ marginTop: passes.length > 0 || warns.length > 0 ? 14 : 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: C.silver,
            letterSpacing: '-0.005em', fontFamily: SANS, marginBottom: 8,
          }}>
            <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, color: C.lavender, marginRight: 4 }}>
              {title}
            </span>
            fails because:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fails.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                  flexShrink: 0, width: 16, height: 16, borderRadius: 999,
                  background: `${C.bad}18`, border: `1px solid ${C.bad}50`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 1,
                }}>
                  <svg width="8" height="8" viewBox="0 0 8 8">
                    <line x1="2" y1="2" x2="6" y2="6" stroke={C.bad} strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="6" y1="2" x2="2" y2="6" stroke={C.bad} strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <span style={{ fontSize: 12, color: C.silver, lineHeight: 1.5, fontFamily: SANS }}>
                  {s.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* empty state */}
      {segments.length === 0 && (
        <p style={{ fontSize: 12, color: C.lavender, fontFamily: SANS, margin: 0 }}>
          Arc data unavailable for this track.
        </p>
      )}
    </div>
  );
}
