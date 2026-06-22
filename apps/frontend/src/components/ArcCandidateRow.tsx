import { ArcSparkline } from './ArcSparkline';
import type { AnalysisResult, SceneArc } from '../utils/apiClient';

const C = {
  magenta:  '#DB2777',
  silver:   '#F4F2FA',
  lavender: '#9B93C4',
  amber:    '#F5B544',
  hairline: 'rgba(123,112,178,0.16)',
  good:     '#4CAF82',
};
const SERIF = '"Instrument Serif", Georgia, serif';

function cleanTitle(raw: string): string {
  let t = raw;
  t = t.replace(/^[0-9a-f]{6,}_/i, '');
  t = t.replace(/_/g, ' ');
  t = t.replace(/\.(mp3|wav|flac|aiff?)$/i, '');
  t = t.replace(/\b(Official\s+Video|Official\s+Audio|Lyric\s+Video|HD|HQ|4K|Audio|Video|background\s+vocals?\s*\d*)\b/gi, '');
  t = t.replace(/\s+\d{1,3}\s*$/, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  if (t.includes(' - ')) t = t.slice(t.indexOf(' - ') + 3).trim();
  return t || raw;
}

type Props = {
  result: AnalysisResult;
  sceneArc?: SceneArc | null;
  selected?: boolean;
  onSelect: () => void;
  topScore: number;
};

export function ArcCandidateRow({ result, sceneArc, selected, onSelect, topScore }: Props) {
  const arc          = result.confidenceScore.arcMatch;
  const primaryScore = arc?.combinedScore ?? result.confidenceScore.score;
  const delta        = !arc ? (topScore - result.confidenceScore.score) : null;
  const title        = cleanTitle(result.track.title);
  const hasCurve     = Boolean(result.confidenceScore.songArcCurve?.length);

  const scoreColor = arc
    ? arc.combinedScore >= 75 ? C.good : arc.combinedScore >= 50 ? C.amber : C.lavender
    : C.silver;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect()}
      style={{
        display: 'grid',
        gridTemplateColumns: '52px 1fr 52px',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        borderRadius: 12,
        background: selected ? 'rgba(219,39,119,0.08)' : 'rgba(15,8,35,0.55)',
        border: selected ? `1px solid rgba(219,39,119,0.30)` : `1px solid ${C.hairline}`,
        borderLeft: selected ? `3px solid ${C.magenta}` : undefined,
        cursor: 'pointer',
        outline: 'none',
        transition: 'background 0.15s, border-color 0.15s',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* sparkline or placeholder */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 28 }}>
        {hasCurve ? (
          <ArcSparkline
            curve={result.confidenceScore.songArcCurve!}
            sceneArc={sceneArc}
            size={{ w: 50, h: 26 }}
          />
        ) : (
          <div style={{ width: 44, height: 16, borderRadius: 4, background: 'rgba(123,112,178,0.07)', border: '1px solid rgba(123,112,178,0.11)' }} />
        )}
      </div>

      {/* title + meta */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.silver, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: C.lavender, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {result.track.artistName ?? 'Unknown artist'}
        </div>
        <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, color: 'rgba(245,166,35,0.65)', letterSpacing: '0.06em', marginTop: 3, display: 'flex', gap: 5 }}>
          {result.track.tempo != null && <span>{result.track.tempo} BPM</span>}
          {result.track.tonalCharacter && <><span>·</span><span style={{ textTransform: 'uppercase' }}>{result.track.tonalCharacter}</span></>}
        </div>
      </div>

      {/* score */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 20, color: scoreColor, lineHeight: 1, letterSpacing: '-0.01em' }}>
          {primaryScore}
        </div>
        {arc ? (
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 8, color: 'rgba(155,147,196,0.55)', letterSpacing: '0.06em', marginTop: 2 }}>arc</div>
        ) : delta != null && delta > 0 ? (
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 8, color: 'rgba(155,147,196,0.50)', letterSpacing: '0.04em', marginTop: 2 }}>−{delta}</div>
        ) : null}
      </div>
    </div>
  );
}
