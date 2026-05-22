import { rightsStatusFor } from '../utils/rightsStatus';
import { BRIEF_LABELS, type BriefId } from '../engine/classifyBrief';
import type { AnalysisResult, SceneParams } from '../utils/apiClient';

const C = {
  purple:        '#7C3AED',
  magenta:       '#DB2777',
  silver:        '#E2E8F0',
  lavender:      '#A78BFA',
  amber:         '#F5B544',
  amberSoft:     'rgba(245, 181, 68, 0.12)',
  amberBorder:   'rgba(245, 181, 68, 0.28)',
  hairline:      'rgba(167, 139, 250, 0.14)',
  hairlineStrong:'rgba(167, 139, 250, 0.22)',
  bg:            '#0F0823',
  textFaint:     'rgba(226,232,240,0.60)',
  textNarrative: 'rgba(226,232,240,0.75)',
  chipBg:        'rgba(167,139,250,0.08)',
  bpmBg:         'rgba(124,58,237,0.16)',
  bpmBorder:     'rgba(124,58,237,0.36)',
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
};

export function DirectorView({ briefText, briefId, sceneParams, results }: DirectorViewProps) {
  const briefChips: string[] = [BRIEF_LABELS[briefId]];
  if (sceneParams.pacing)          briefChips.push(sceneParams.pacing.charAt(0).toUpperCase() + sceneParams.pacing.slice(1));
  if (sceneParams.sceneLengthSec != null) briefChips.push(`${sceneParams.sceneLengthSec}s`);

  return (
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: `radial-gradient(1200px 700px at 18% 0%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 600px at 82% 100%, rgba(219,39,119,0.10), transparent 60%), #06030F` }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '8px 20px 56px' }}>

        {/* ── doc-head ── */}
        <div style={{ padding: '16px 4px 20px', display: 'flex', flexDirection: 'column', gap: 14, borderBottom: `1px solid ${C.hairline}` }}>

          {/* topline: logo + badge */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SvLogo />
            <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, padding: '4px 8px', borderRadius: 999, background: C.chipBg, border: `1px solid ${C.hairline}` }}>
              Read only
            </span>
          </div>

          {/* sent-by */}
          <div style={{ fontSize: 11, color: C.textFaint, letterSpacing: '0.02em' }}>
            Shared by{' '}<b style={{ color: C.silver, fontWeight: 600 }}>Music Supervisor</b>{' '}·{' '}{formatShareDate()}
          </div>

          {/* brief card */}
          <div style={{ padding: '18px 18px 16px', borderRadius: 16, background: 'linear-gradient(180deg, rgba(124,58,237,0.10), rgba(124,58,237,0.02))', border: `1px solid ${C.hairline}` }}>
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
          const rights     = rightsStatusFor(r.rightsProfile);
          const score      = r.confidenceScore.score;
          const fillPct    = Math.max(0, Math.min(100, score));
          const title      = stripArtist(r.track.title);

          return (
            <div
              key={r.track.id}
              style={{
                position: 'relative',
                background: isTop
                  ? 'linear-gradient(180deg, rgba(124,58,237,0.16), rgba(124,58,237,0.02) 70%)'
                  : C.cardBg,
                border: `1px solid ${isTop ? 'rgba(167,139,250,0.30)' : C.hairline}`,
                borderRadius: 16,
                padding: '14px 14px 12px',
                marginBottom: 12,
              }}
            >
              {/* ghosted rank */}
              <span
                aria-hidden
                style={{ position: 'absolute', top: 12, right: 14, fontFamily: SERIF, fontSize: 32, lineHeight: 1, color: 'rgba(167,139,250,0.30)', fontWeight: 400, letterSpacing: '-0.03em', userSelect: 'none' }}
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
                {rights === 'unclear' && (
                  <Chip variant="warn"><WarnQmark />RIGHTS UNCLEAR</Chip>
                )}
              </div>

              {/* narrative */}
              <div style={{ marginTop: 10, fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, lineHeight: 1.4, color: C.textNarrative }}>
                "{r.confidenceScore.explanation}"
              </div>

              {/* score bar */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 8, background: C.scoreBg, borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${fillPct}%`, background: `linear-gradient(90deg, ${C.purple}, ${C.magenta})`, borderRadius: 999, boxShadow: '0 0 14px rgba(124,58,237,0.4)' }} />
                </div>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 700, color: C.silver, minWidth: 56, textAlign: 'right', letterSpacing: '-0.01em' }}>
                  {score}<span style={{ color: C.lavender, fontWeight: 500, fontSize: 11, marginLeft: 2 }}>/100</span>
                </div>
              </div>

              {/* approve / pass */}
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  style={{ borderRadius: 11, padding: '11px 8px', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: `linear-gradient(135deg, ${C.purple}, ${C.magenta})`, color: 'white', border: 'none', boxShadow: '0 10px 22px -10px rgba(124,58,237,0.6)', cursor: 'default' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12 L10 17 L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Approve
                </button>
                <button
                  type="button"
                  style={{ borderRadius: 11, padding: '11px 8px', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: C.silver, border: `1px solid ${C.hairlineStrong}`, cursor: 'default' }}
                >
                  Pass
                </button>
              </div>
            </div>
          );
        })}

        {/* ── footer ── */}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.hairline}`, fontSize: 10, color: C.lavender, letterSpacing: '0.04em', lineHeight: 1.5, textAlign: 'center' }}>
          No account needed · decisions sync back in real time
        </div>

      </div>
    </div>
  );
}
