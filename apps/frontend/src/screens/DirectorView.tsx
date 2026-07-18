import { useState } from 'react';
import { rightsDisplayFor } from '../utils/rightsStatus';
import { BRIEF_LABELS, type BriefId } from '../engine/classifyBrief';
import type { AnalysisResult, SceneParams } from '../utils/apiClient';

const C = {
  purple:        '#F5A623',
  magenta:       '#DB2777',
  silver:        '#F4F2FA',
  lavender:      '#9B93C4',
  amber:         '#F5B544',
  amberSoft:     'rgba(245, 181, 68, 0.12)',
  amberBorder:   'rgba(245, 181, 68, 0.28)',
  hairline:      'rgba(123, 112, 178, 0.16)',
  hairlineStrong:'rgba(123, 112, 178, 0.30)',
  bg:            '#0D0B1E',
  textFaint:     'rgba(244,242,250,0.60)',
  textNarrative: 'rgba(244,242,250,0.75)',
  chipBg:        'rgba(123,112,178,0.08)',
  bpmBg:         'rgba(245,166,35,0.16)',
  bpmBorder:     'rgba(245,166,35,0.36)',
  scoreBg:       'rgba(255,255,255,0.05)',
  cardBg:        'rgba(255,255,255,0.02)',
};

const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';

const COUNT_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five'];

function countWord(n: number) {
  return COUNT_WORDS[n] ?? 'Tracks';
}

function stripArtist(title: string) {
  return title.includes(' - ') ? title.slice(title.indexOf(' - ') + 3) : title;
}

function formatShareDate() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SvLogo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, letterSpacing: '-0.01em', fontFamily: SANS }}>
      <span
        className="sv-glyph"
        style={{
          width: 22, height: 22, borderRadius: 7, position: 'relative', flexShrink: 0,
          background: `conic-gradient(from 210deg at 50% 50%, ${C.purple}, ${C.magenta}, ${C.purple})`,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset',
        }}
      />
      <span style={{ fontSize: 15 }}>
        <b>SyncVision</b>
      </span>
    </span>
  );
}

function Chip({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'bpm' | 'warn' }) {
  const styles: React.CSSProperties =
    variant === 'bpm'
      ? { background: C.bpmBg, border: `1px solid ${C.bpmBorder}`, color: C.silver }
      : variant === 'warn'
      ? { background: C.amberSoft, border: `1px solid ${C.amberBorder}`, color: C.amber }
      : { background: C.chipBg, border: `1px solid ${C.hairline}`, color: C.lavender };

  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', padding: '4px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', ...styles }}>
      {children}
    </span>
  );
}

function WarnQmark() {
  return (
    <span style={{ width: 13, height: 13, borderRadius: '50%', background: 'rgba(245,181,68,0.25)', display: 'inline-grid', placeItems: 'center', fontSize: 9, fontWeight: 800, color: C.amber, fontFamily: SANS, flexShrink: 0 }}>
      ?
    </span>
  );
}

type DirectorViewProps = {
  briefText: string;
  briefId: BriefId;
  sceneParams: SceneParams;
  results: AnalysisResult[];
  onBack?: () => void;
};

type Decision = 'approved' | 'passed';

export function DirectorView({ briefText, briefId, sceneParams, results, onBack }: DirectorViewProps) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  const decide = (trackId: string, d: Decision) =>
    setDecisions(prev => prev[trackId] === d
      ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== trackId)) // tap again to undo
      : { ...prev, [trackId]: d });

  const approvedCount = Object.values(decisions).filter(d => d === 'approved').length;

  const briefChips: string[] = [BRIEF_LABELS[briefId]];
  if (sceneParams.pacing)          briefChips.push(sceneParams.pacing.charAt(0).toUpperCase() + sceneParams.pacing.slice(1));
  if (sceneParams.sceneLengthSec != null) briefChips.push(`${sceneParams.sceneLengthSec}s`);

  return (
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: `radial-gradient(900px 600px at 12% 8%, rgba(245,166,35,0.14), transparent 60%), radial-gradient(800px 500px at 95% 100%, rgba(221,122,58,0.10), transparent 60%), #0D0B1E` }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '8px 20px 56px' }}>

        {/* ── doc-head ── */}
        <div style={{ padding: '16px 4px 20px', display: 'flex', flexDirection: 'column', gap: 14, borderBottom: `1px solid ${C.hairline}` }}>

          {/* topline: logo + badge */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <SvLogo />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, padding: '4px 8px', borderRadius: 999, background: C.chipBg, border: `1px solid ${C.hairline}` }}>
                Director review
              </span>
              {onBack && (
                <button type="button" onClick={onBack} style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.silver, padding: '4px 10px', borderRadius: 999, background: 'transparent', border: `1px solid ${C.hairlineStrong}`, cursor: 'pointer', fontFamily: SANS, fontWeight: 600 }}>
                  &larr; Workspace
                </button>
              )}
            </div>
          </div>

          {/* sent-by */}
          <div style={{ fontSize: 11, color: C.textFaint, letterSpacing: '0.02em' }}>
            Shared by{' '}<b style={{ color: C.silver, fontWeight: 600 }}>Music Supervisor</b>{' '}·{' '}{formatShareDate()}
          </div>

          {/* brief card */}
          <div style={{ padding: '18px 18px 16px', borderRadius: 16, background: 'linear-gradient(180deg, rgba(245,166,35,0.10), rgba(245,166,35,0.02))', border: `1px solid ${C.hairline}` }}>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.lavender, marginBottom: 8 }}>
              The Scene
            </div>
            <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 19, lineHeight: 1.3, color: C.silver, fontWeight: 400, letterSpacing: '-0.005em', paddingBottom: 4 }}>
              {briefText}
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {briefChips.map((c) => (
                <Chip key={c}>{c}</Chip>
              ))}
            </div>
          </div>
        </div>

        {/* ── shortlist heading ── */}
        <div style={{ marginTop: 18, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <h4 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 18, color: C.silver, letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>
            {countWord(results.length)} for your call
          </h4>
          <span style={{ fontSize: 10, color: C.lavender, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Ranked by fit
          </span>
        </div>

        {/* ── track cards ── */}
        {results.map((r) => {
          const isTop      = r.rank === 1;
          const rights     = rightsDisplayFor(r.rightsProfile);
          const score      = r.confidenceScore.score;
          const fillPct    = Math.max(0, Math.min(100, score));
          const title      = stripArtist(r.track.title);
          const decision   = decisions[r.track.id];

          return (
            <div
              key={r.track.id}
              style={{
                position: 'relative',
                background: isTop
                  ? 'linear-gradient(180deg, rgba(245,166,35,0.16), rgba(245,166,35,0.02) 70%)'
                  : C.cardBg,
                border: `1px solid ${
                  decision === 'approved' ? 'rgba(76,175,130,0.55)' :
                  decision === 'passed'   ? C.hairline :
                  isTop ? 'rgba(123,112,178,0.30)' : C.hairline
                }`,
                boxShadow: decision === 'approved' ? '0 0 0 1px rgba(76,175,130,0.25), 0 12px 28px -18px rgba(76,175,130,0.5)' : undefined,
                opacity: decision === 'passed' ? 0.45 : 1,
                borderRadius: 16,
                padding: '14px 14px 12px',
                marginBottom: 12,
                transition: 'opacity 0.25s, border-color 0.25s, box-shadow 0.25s',
              }}
            >
              {/* ghosted rank */}
              <span
                aria-hidden
                style={{ position: 'absolute', top: 12, right: 14, fontFamily: SERIF, fontSize: 32, lineHeight: 1, color: 'rgba(123,112,178,0.30)', fontWeight: 400, letterSpacing: '-0.03em', userSelect: 'none' }}
              >
                {r.rank}
              </span>

              {/* title */}
              <div style={{ fontFamily: SERIF, fontSize: 19, color: C.silver, lineHeight: 1.1, paddingRight: 32 }}>
                {title}
              </div>

              {/* meta chips */}
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {r.track.tempo != null && (
                  <Chip variant="bpm">{r.track.tempo} BPM</Chip>
                )}
                {r.track.tonalCharacter && (
                  <Chip>{r.track.tonalCharacter}</Chip>
                )}
                {rights.state !== 'CLEAR' && (
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', padding: '4px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', background: rights.bgColor, border: `1px solid ${rights.borderColor}`, color: rights.color }}>
                    {rights.clickable && <WarnQmark />}
                    {rights.label.toUpperCase()}
                  </span>
                )}
              </div>

              {/* narrative */}
              <div style={{ marginTop: 10, fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, lineHeight: 1.4, color: C.textNarrative }}>
                "{r.confidenceScore.explanation}"
              </div>

              {/* score bar */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 8, background: C.scoreBg, borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${fillPct}%`, background: `linear-gradient(90deg, ${C.purple}, ${C.magenta})`, borderRadius: 999, boxShadow: '0 0 14px rgba(245,166,35,0.4)' }} />
                </div>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 700, color: C.silver, minWidth: 56, textAlign: 'right', letterSpacing: '-0.01em' }}>
                  {score}<span style={{ color: C.lavender, fontWeight: 500, fontSize: 11, marginLeft: 2 }}>/100</span>
                </div>
              </div>

              {/* approve / pass */}
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => decide(r.track.id, 'approved')}
                  style={{
                    borderRadius: 11, padding: '11px 8px', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: decision === 'approved' ? '#2f8f63' : `linear-gradient(135deg, ${C.purple}, ${C.magenta})`,
                    color: 'white', border: 'none',
                    boxShadow: decision === 'approved' ? '0 10px 22px -10px rgba(76,175,130,0.7)' : '0 10px 22px -10px rgba(245,166,35,0.6)',
                    cursor: 'pointer', transition: 'background 0.2s',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12 L10 17 L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {decision === 'approved' ? 'Approved' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => decide(r.track.id, 'passed')}
                  style={{
                    borderRadius: 11, padding: '11px 8px', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: decision === 'passed' ? 'rgba(232,90,90,0.16)' : 'transparent',
                    color: decision === 'passed' ? '#E85A5A' : C.silver,
                    border: `1px solid ${decision === 'passed' ? 'rgba(232,90,90,0.45)' : C.hairlineStrong}`,
                    cursor: 'pointer', transition: 'background 0.2s, color 0.2s',
                  }}
                >
                  {decision === 'passed' ? 'Passed' : 'Pass'}
                </button>
              </div>
            </div>
          );
        })}

        {/* ── footer ── */}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.hairline}`, fontSize: 10, color: C.lavender, letterSpacing: '0.04em', lineHeight: 1.5, textAlign: 'center' }}>
          {approvedCount > 0
            ? <span style={{ color: '#4CAF82', fontWeight: 700 }}>{approvedCount} track{approvedCount > 1 ? 's' : ''} approved — the supervisor sees this call.</span>
            : 'Tap Approve or Pass on each cue · tap again to undo'}
        </div>

      </div>
    </div>
  );
}
