// apps/frontend/src/pages/ShareView.tsx
// Polished director/share view — pixel-faithful to the "Shortlist + Share" design artifact.
// Shown when someone opens a #share= link. Wired to live AnalysisResult data.
import { useState, useMemo } from 'react';
import type { AnalysisResult, SceneParams } from '../utils/apiClient';
import type { BriefId } from '../engine/classifyBrief';
import { rightsDisplayFor } from '../utils/rightsStatus';

// ─── design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:            '#0F0823',
  bg2:           '#170B33',
  purple:        '#7C3AED',
  magenta:       '#DB2777',
  lavender:      '#A78BFA',
  silver:        '#E2E8F0',
  good:          '#34D399',
  bad:           '#F87171',
  amber:         '#F5B544',
  hairline:      'rgba(167,139,250,0.14)',
  hairlineStrong:'rgba(167,139,250,0.22)',
  textFaint:     'rgba(226,232,240,0.60)',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO  = '"JetBrains Mono", monospace';
const SANS  = '"Manrope", system-ui, sans-serif';

// ─── helpers ──────────────────────────────────────────────────────────────────
function stripArtist(title: string) {
  return title.includes(' - ') ? title.slice(title.indexOf(' - ') + 3) : title;
}

function seededHeights(seed: number, count: number): number[] {
  const out: number[] = [];
  let s = seed >>> 0 || 0xdeadbeef;
  for (let i = 0; i < count; i++) {
    s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0);
    out.push((s % 65) + 20);
  }
  return out;
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── mini waveform ────────────────────────────────────────────────────────────
function MiniWave({ seed }: { seed: number }) {
  const bars = useMemo(() => seededHeights(seed, 32), [seed]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 38, flex: 1 }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: 2, borderRadius: 999, flexShrink: 0,
          height: `${h}%`,
          background: i < 12 ? `linear-gradient(to top, ${C.purple}, ${C.magenta})` : 'rgba(167,139,250,0.25)',
        }} />
      ))}
    </div>
  );
}

// ─── score axis bar ───────────────────────────────────────────────────────────
function AxisBar({ label, subLabel, pct }: { label: string; subLabel: string; pct: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender }}>
        <span>{label}<span style={{ color: C.silver, fontWeight: 600, marginLeft: 4 }}>{subLabel}</span></span>
        <span style={{ color: C.silver, fontFamily: MONO }}>{pct}%</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #F5B544, #F97316)', borderRadius: 999 }} />
      </div>
    </div>
  );
}

// ─── chip ────────────────────────────────────────────────────────────────────
function Chip({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{
      fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
      padding: '3px 9px', borderRadius: 999, fontWeight: 600,
      background: 'rgba(167,139,250,0.08)', border: `1px solid ${C.hairline}`,
      color: C.lavender, fontFamily: SANS, whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </span>
  );
}

// ─── track card ───────────────────────────────────────────────────────────────
type Decision = 'approve' | 'pass';

interface TrackCardProps {
  result: AnalysisResult;
  decision?: Decision;
  comment?: string;
  onDecide: (action: Decision, comment: string) => void;
}

function TrackCard({ result, decision, comment, onDecide }: TrackCardProps) {
  const [localComment, setLocalComment] = useState('');
  const [deciding, setDeciding] = useState(false);
  const rights = rightsDisplayFor(result.rightsProfile);
  const title = stripArtist(result.track.title);
  const score = result.confidenceScore.score;
  const isRank1 = result.rank === 1;
  const seed = result.track.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

  const scoreBreakdown = [
    { label: 'Scene', subLabel: 'fit',    pct: result.confidenceScore.sceneFitBreakdown },
    { label: 'Mood',  subLabel: 'match',  pct: result.confidenceScore.metaBreakdown },
    { label: 'Rights',subLabel: 'score',  pct: result.confidenceScore.rightsBreakdown },
    { label: 'Audio', subLabel: 'quality',pct: result.confidenceScore.audioBreakdown },
  ];

  return (
    <div style={{
      position: 'relative',
      background: isRank1
        ? 'radial-gradient(140% 60% at 100% 0%, rgba(219,39,119,0.14), transparent 60%), linear-gradient(180deg, rgba(124,58,237,0.16), rgba(124,58,237,0.02) 70%)'
        : 'rgba(255,255,255,0.025)',
      border: `1px solid ${decision === 'approve' ? 'rgba(52,211,153,0.4)' : decision === 'pass' ? 'rgba(248,113,113,0.2)' : isRank1 ? 'rgba(167,139,250,0.34)' : C.hairline}`,
      borderRadius: 16,
      padding: '22px 26px',
      overflow: 'hidden',
      opacity: decision === 'pass' ? 0.55 : 1,
      transition: 'opacity 0.2s, border-color 0.2s',
      ...(decision === 'approve' ? {
        background: 'radial-gradient(140% 60% at 100% 0%, rgba(52,211,153,0.10), transparent 60%), linear-gradient(180deg, rgba(52,211,153,0.05), rgba(0,0,0,0.0))',
      } : {}),
    }}>
      {/* ghost rank number */}
      <div style={{
        position: 'absolute', top: -10, right: 18,
        fontFamily: SERIF, fontSize: 96, lineHeight: 1,
        color: isRank1 ? 'rgba(255,255,255,0.10)' : 'rgba(167,139,250,0.10)',
        fontWeight: 400, letterSpacing: '-0.04em', pointerEvents: 'none',
      }}>{result.rank}</div>

      {/* header */}
      <div>
        <div style={{ fontFamily: SERIF, fontSize: 28, lineHeight: 1.05, letterSpacing: '-0.012em', color: C.silver, fontWeight: 400, paddingRight: 60 }}>
          {title}
        </div>
        <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.lavender, marginTop: 4 }}>
          <span style={{ color: C.silver, fontWeight: 500 }}>{result.track.artistName ?? 'Unknown Artist'}</span>
        </div>

        {/* chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {result.track.tempo && (
            <Chip style={{ background: 'rgba(124,58,237,0.16)', borderColor: 'rgba(124,58,237,0.36)', color: C.silver }}>
              {Math.round(result.track.tempo)} BPM
            </Chip>
          )}
          {result.track.tonalCharacter && <Chip>{result.track.tonalCharacter}</Chip>}
          {result.track.energyCharacter && <Chip>{result.track.energyCharacter}</Chip>}
          <Chip style={{ background: rights.bgColor, borderColor: rights.borderColor, color: rights.color }}>
            {rights.label}
          </Chip>
        </div>
      </div>

      {/* body: reasoning + score */}
      <div className="sv-trk-body" style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 200px', gap: 20, alignItems: 'start' }}>
        {/* left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* AI reasoning */}
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'linear-gradient(180deg, rgba(219,39,119,0.06), transparent)',
            border: '1px solid rgba(219,39,119,0.2)',
          }}>
            <div style={{ fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: C.magenta, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              WHY THIS TRACK
            </div>
            <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, lineHeight: 1.45, color: C.silver, letterSpacing: '-0.005em' }}>
              {result.confidenceScore.explanation}
            </div>
          </div>

          {/* waveform */}
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(0,0,0,0.32)', border: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0, border: 'none', cursor: 'pointer',
              background: isRank1 ? `linear-gradient(135deg, ${C.purple}, ${C.magenta})` : C.silver,
              color: isRank1 ? 'white' : C.bg,
              display: 'grid', placeItems: 'center',
              boxShadow: isRank1 ? '0 10px 20px -10px rgba(219,39,119,0.5)' : 'none',
            }}>
              <svg width="12" height="12" viewBox="0 0 10 10"><path d="M2 1 L8 5 L2 9 Z" fill="currentColor"/></svg>
            </button>
            <MiniWave seed={seed} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, fontFamily: MONO, fontSize: 10 }}>
              <span style={{ color: C.silver, fontWeight: 700 }}>1:12</span>
              <span style={{ color: C.lavender, opacity: 0.7 }}>3:44</span>
            </div>
          </div>
        </div>

        {/* right: score */}
        <div className="sv-trk-right" style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.hairline}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: C.lavender }}>FIT SCORE</div>
            <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 26, color: C.silver, letterSpacing: '-0.01em' }}>
              {score}<span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 11, color: C.lavender }}>/100</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scoreBreakdown.map(({ label, subLabel, pct }) => (
              <AxisBar key={label} label={label} subLabel={subLabel} pct={pct} />
            ))}
          </div>
        </div>
      </div>

      {/* actions */}
      <div style={{ marginTop: 18 }}>
        {decision ? (
          <div style={{
            padding: '12px 14px', borderRadius: 11,
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12.5, fontWeight: 600,
            ...(decision === 'approve'
              ? { background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.3)', color: C.good }
              : { background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.22)', color: C.bad }),
          }}>
            {decision === 'approve'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            }
            <span>{decision === 'approve' ? 'Approved' : 'Passed'}</span>
            {comment && <span style={{ color: C.textFaint, fontWeight: 400 }}>— "{comment}"</span>}
            <span style={{ flex: 1 }} />
            <button
              onClick={() => onDecide(decision === 'approve' ? 'pass' : 'approve', '')}
              style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'inherit', opacity: 0.65, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: SANS }}
            >
              Undo
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deciding && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                borderRadius: 11, background: 'rgba(0,0,0,0.24)', border: `1px solid ${C.hairline}`,
                ...(localComment ? { background: 'linear-gradient(180deg,rgba(219,39,119,0.08),transparent)', borderColor: 'rgba(219,39,119,0.22)' } : {}),
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.lavender} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                <input
                  autoFocus
                  value={localComment}
                  onChange={e => setLocalComment(e.target.value)}
                  placeholder="Add a note (optional)…"
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.silver, fontSize: 13, fontFamily: SANS, fontStyle: localComment ? 'normal' : 'italic' }}
                />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                onClick={() => {
                  if (!deciding) { setDeciding(true); return; }
                  onDecide('approve', localComment);
                }}
                style={{
                  padding: '12px 14px', borderRadius: 11,
                  fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', border: 'none', cursor: 'pointer',
                  background: `linear-gradient(135deg, ${C.purple}, ${C.magenta})`, color: 'white',
                  boxShadow: '0 12px 26px -12px rgba(219,39,119,0.5), inset 0 0 0 1px rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: SANS,
                  position: 'relative', overflow: 'hidden',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                {deciding ? 'Confirm Approve' : 'Approve'}
              </button>
              <button
                onClick={() => onDecide('pass', localComment)}
                style={{
                  padding: '12px 14px', borderRadius: 11,
                  fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em',
                  background: 'transparent', color: C.silver, cursor: 'pointer',
                  border: `1px solid ${C.hairlineStrong}`, fontFamily: SANS,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                Pass
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── props ────────────────────────────────────────────────────────────────────
interface ShareViewProps {
  briefText: string;
  briefId: BriefId;
  sceneParams: SceneParams;
  results: AnalysisResult[];
}

// ─── main view ────────────────────────────────────────────────────────────────
export default function ShareView({ briefText, results }: ShareViewProps) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const approvedCount = Object.values(decisions).filter(d => d === 'approve').length;
  const passedCount   = Object.values(decisions).filter(d => d === 'pass').length;
  const decidedCount  = approvedCount + passedCount;
  const total         = results.length;

  const handleDecide = (trackId: string, action: Decision, comment: string) => {
    setDecisions(p => ({ ...p, [trackId]: action }));
    if (comment) setComments(p => ({ ...p, [trackId]: comment }));
  };

  const progressPct = total > 0 ? Math.round((decidedCount / total) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver }}>
      {/* ── 3-column desktop layout ── */}
      <div className="sv-share-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,260px) 1fr minmax(0,240px)',
        minHeight: '100vh',
        maxWidth: 1200,
        margin: '0 auto',
      }}>

        {/* ── LEFT RAIL: sender + scene ── */}
        <aside className="sv-share-left" style={{
          borderRight: `1px solid ${C.hairline}`,
          padding: '28px 26px 22px',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(0,0,0,0.15)',
          position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        }}>
          {/* brand + badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 22, borderBottom: `1px solid ${C.hairline}` }}>
            <img src="/logo.png" alt="SyncVision" style={{ height: 22, width: 'auto' }} />
            <span style={{
              fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: C.lavender,
              padding: '4px 9px', borderRadius: 999, border: `1px solid ${C.hairline}`,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.magenta, boxShadow: `0 0 6px ${C.magenta}` }} />
              READ-ONLY
            </span>
          </div>

          {/* sender */}
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.lavender}, ${C.magenta})`,
              color: 'white', display: 'grid', placeItems: 'center',
              fontWeight: 700, fontSize: 15,
              boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
            }}>M</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.silver, letterSpacing: '-0.005em' }}>Music Supervisor</div>
              <div style={{ fontSize: 11, color: C.lavender, letterSpacing: '0.02em', marginTop: 2 }}>SyncVision</div>
              <div style={{ fontSize: 10, color: 'rgba(167,139,250,0.6)', marginTop: 4, letterSpacing: '0.06em' }}>{formatDate()}</div>
            </div>
          </div>

          {/* scene eyebrow */}
          <div style={{ marginTop: 26, fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender }}>
            THE SCENE
          </div>
          <div style={{ marginTop: 10, fontFamily: SERIF, fontSize: 28, lineHeight: 1, letterSpacing: '-0.012em', color: C.silver, fontWeight: 400 }}>
            The Quiet <em style={{ fontStyle: 'italic', color: C.lavender }}>Surrender</em>
          </div>

          {/* brief quote */}
          <div style={{
            marginTop: 14, fontFamily: SERIF, fontStyle: 'italic',
            fontSize: 14, lineHeight: 1.45, color: 'rgba(226,232,240,0.78)',
            paddingLeft: 14, borderLeft: `2px solid ${C.magenta}`,
          }}>
            {briefText || 'A slow, intimate moment — the character finally lets their guard down.'}
          </div>

          {/* meta grid */}
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { k: 'TRACKS', v: String(total) },
              { k: 'FORMAT', v: 'SHORTLIST' },
            ].map(({ k, v }) => (
              <div key={k} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(167,139,250,0.04)', border: `1px solid ${C.hairline}` }}>
                <div style={{ fontSize: 8.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.lavender, marginBottom: 4 }}>{k}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.silver, letterSpacing: '0.04em' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* footer link */}
          <div style={{ marginTop: 'auto', paddingTop: 22, borderTop: `1px solid ${C.hairline}`, fontSize: 10, letterSpacing: '0.14em', color: 'rgba(167,139,250,0.6)', lineHeight: 1.6 }}>
            Shared via <span style={{ color: C.silver, fontFamily: MONO, fontWeight: 500, fontSize: 10, letterSpacing: '0.06em' }}>syncvision.app</span>
            <br />No account needed
          </div>
        </aside>

        {/* ── CENTER: track list ── */}
        <main className="sv-share-main" style={{ padding: '28px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 16, marginBottom: 22, borderBottom: `1px solid ${C.hairline}` }}>
            <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 24, color: C.silver, letterSpacing: '-0.01em' }}>
              {total === 1 ? 'One track' : `${total} tracks`}{' '}
              <em style={{ fontStyle: 'italic', color: C.lavender }}>for your call</em>
            </h2>
            <span style={{ fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender }}>RANKED BY AI FIT</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {results.map(result => (
              <TrackCard
                key={result.track.id}
                result={result}
                decision={decisions[result.track.id]}
                comment={comments[result.track.id]}
                onDecide={(action, comment) => handleDecide(result.track.id, action, comment)}
              />
            ))}
          </div>

          {/* jump footer */}
          {decidedCount > 0 && decidedCount < total && (
            <div style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender }}>
              <span><span style={{ color: C.silver, fontFamily: MONO, fontWeight: 500 }}>{total - decidedCount}</span> tracks remaining</span>
            </div>
          )}
        </main>

        {/* ── RIGHT RAIL: decision summary ── */}
        <aside className="sv-share-right" style={{
          borderLeft: `1px solid ${C.hairline}`,
          padding: '28px 26px 22px',
          background: 'rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column', gap: 22,
          position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        }}>
          {/* progress */}
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, marginBottom: 12 }}>PROGRESS</div>
            <div style={{
              padding: '18px 18px 16px', borderRadius: 14,
              background: 'linear-gradient(180deg, rgba(124,58,237,0.10), rgba(124,58,237,0.02))',
              border: `1px solid ${C.hairline}`, position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 56, lineHeight: 1, color: C.silver, letterSpacing: '-0.03em' }}>
                {decidedCount}<span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 14, color: C.lavender, letterSpacing: '0.04em' }}> / {total}</span>
              </div>
              <div style={{ marginTop: 8, fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: 'rgba(226,232,240,0.7)' }}>
                {decidedCount === 0 ? 'No decisions yet' : decidedCount === total ? 'All reviewed' : 'tracks reviewed'}
              </div>
              <div style={{ marginTop: 14, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressPct}%`, background: `linear-gradient(90deg, ${C.purple}, ${C.magenta})`, borderRadius: 999, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          </div>

          {/* track summary list */}
          {decidedCount > 0 && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, marginBottom: 12 }}>DECISIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.map(result => {
                  const d = decisions[result.track.id];
                  if (!d) return null;
                  const title = stripArtist(result.track.title);
                  return (
                    <div key={result.track.id} style={{
                      padding: '10px 12px', borderRadius: 10,
                      display: 'flex', alignItems: 'center', gap: 10,
                      ...(d === 'approve'
                        ? { borderColor: 'rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.3)' }
                        : { borderColor: 'rgba(248,113,113,0.22)', background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.22)' }),
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
                        fontFamily: SERIF, fontSize: 13, border: '1px solid',
                        ...(d === 'approve'
                          ? { background: 'rgba(52,211,153,0.18)', color: C.good, borderColor: 'rgba(52,211,153,0.4)' }
                          : { background: 'rgba(248,113,113,0.14)', color: C.bad, borderColor: 'rgba(248,113,113,0.3)' }),
                      }}>{result.rank}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: SERIF, fontSize: 13, color: C.silver, lineHeight: 1.1, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                        <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 3, color: d === 'approve' ? C.good : C.bad }}>
                          {d === 'approve' ? '✓ APPROVED' : '✕ PASSED'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* send button */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {submitted ? (
              <div style={{ padding: '13px 14px', borderRadius: 12, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: C.good, fontSize: 13, fontWeight: 700, textAlign: 'center', letterSpacing: '0.04em' }}>
                ✓ Decisions Sent
              </div>
            ) : (
              <button
                disabled={decidedCount === 0}
                onClick={() => setSubmitted(true)}
                style={{
                  padding: '13px 14px', borderRadius: 12, border: 'none', cursor: decidedCount > 0 ? 'pointer' : 'not-allowed',
                  background: decidedCount > 0 ? `linear-gradient(135deg, ${C.purple}, ${C.magenta})` : 'rgba(167,139,250,0.12)',
                  color: decidedCount > 0 ? 'white' : 'rgba(167,139,250,0.5)',
                  fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: SANS,
                  boxShadow: decidedCount > 0 ? '0 16px 30px -14px rgba(124,58,237,0.55), inset 0 0 0 1px rgba(255,255,255,0.06)' : 'none',
                  transition: 'background 0.2s, box-shadow 0.2s',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Send Decisions
              </button>
            )}
            <div style={{ textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: 'rgba(167,139,250,0.65)' }}>
              {submitted ? 'Thank you for your feedback.' : 'Your choices sync back in real time.'}
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .sv-share-grid { display: block !important; }
          .sv-share-left { display: none !important; }
          .sv-share-right { position: static !important; height: auto !important; border-left: none !important; border-top: 1px solid rgba(167,139,250,0.14) !important; }
          .sv-share-main { padding: 20px 16px !important; }
          .sv-trk-body { grid-template-columns: 1fr !important; }
          .sv-trk-right { display: none !important; }
        }
      `}</style>
    </div>
  );
}
