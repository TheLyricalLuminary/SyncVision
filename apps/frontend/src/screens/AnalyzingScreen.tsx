import type { JobPhase } from '../hooks/useAnalysisJob';

type AnalyzingScreenProps = {
  phase: JobPhase;
  warning: string | null;
  error: string | null;
  elapsedMs: number;
  onRetry: () => void;
  onBackToIngest: () => void;
};

const C = {
  purple:        '#7C3AED',
  magenta:       '#DB2777',
  silver:        '#E2E8F0',
  lavender:      '#A78BFA',
  good:          '#34D399',
  amber:         '#F5B544',
  hairline:      'rgba(167, 139, 250, 0.14)',
  hairlineStrong:'rgba(167, 139, 250, 0.22)',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';
const BG    = `radial-gradient(1200px 700px at 18% 0%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 600px at 82% 100%, rgba(219,39,119,0.10), transparent 60%), #06030F`;

const PHASE_STAGE: Partial<Record<JobPhase, string>> = {
  submitting:  'Sending your tracks…',
  pending:     'In queue…',
  processing:  'Checking rights clearance…',
};

export function AnalyzingScreen({ phase, warning, error, elapsedMs, onRetry, onBackToIngest }: AnalyzingScreenProps) {
  const isError  = phase === 'failed' || phase === 'timed-out';
  const elapsedSec = Math.floor(elapsedMs / 1000);

  return (
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: BG }}>
      <style>{`
        @keyframes sv-spin { to { transform: rotate(360deg); } }
        @keyframes sv-pulse { 0% { transform: scale(0.5); opacity: 0; } 20% { opacity: 0.7; } 100% { transform: scale(1.4); opacity: 0; } }
        @keyframes sv-eq { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
        @keyframes sv-dotwave { 0%, 100% { opacity: 0.25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
        @keyframes sv-analyzing { 0% { transform: translateX(-100%); } 100% { transform: translateX(180%); } }
        @keyframes sv-pulse-dot { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }
        .sv-pulse-ring { position: absolute; inset: 0; border-radius: 50%; border: 1px solid rgba(167,139,250,0.3); animation: sv-pulse 2.6s ease-out infinite; }
        .sv-spin-core { animation: sv-spin 6s linear infinite; }
        .sv-eq-bar { display: block; width: 4px; border-radius: 2px; background: linear-gradient(180deg, ${C.magenta}, ${C.purple}); animation: sv-eq 1.1s ease-in-out infinite; }
        .sv-dot { display: inline-block; animation: sv-dotwave 1.4s ease-in-out infinite; color: ${C.magenta}; }
        .sv-an-topbar { position: sticky; top: 0; z-index: 10; background: linear-gradient(180deg,rgba(6,3,15,0.94),rgba(6,3,15,0.6) 70%,transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid ${C.hairline}; }
        .sv-an-topbar-inner { max-width: 1280px; margin: 0 auto; padding: 14px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .sv-an-stepper { display: none; align-items: center; gap: 10px; }
        .sv-an-step { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: rgba(167,139,250,0.6); }
        .sv-an-step .n { width: 22px; height: 22px; border-radius: 50%; border: 1px solid ${C.hairlineStrong}; display: grid; place-items: center; font-family: "JetBrains Mono",monospace; font-size: 10px; font-weight: 600; color: rgba(167,139,250,0.7); }
        .sv-an-step.active { color: ${C.silver}; }
        .sv-an-step.active .n { background: linear-gradient(135deg,${C.purple},${C.magenta}); border-color: transparent; color: white; }
        .sv-an-step.done .n { background: rgba(124,58,237,0.18); border-color: rgba(167,139,250,0.35); color: ${C.silver}; }
        .sv-an-tick { width: 18px; height: 1px; background: ${C.hairlineStrong}; display: inline-block; }
        .sv-an-badge { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: ${C.lavender}; padding: 4px 10px; border-radius: 999px; background: rgba(167,139,250,0.08); border: 1px solid ${C.hairline}; white-space: nowrap; }
        .sv-an-badge b { color: ${C.silver}; font-weight: 700; }
        .sv-an-shell { max-width: 1280px; margin: 0 auto; padding: 28px 28px 80px; }
        .sv-an-stage { display: grid; grid-template-columns: 1fr; gap: 24px; align-items: stretch; }
        .sv-an-hero { position: relative; padding: 32px 24px; border-radius: 22px; background: radial-gradient(80% 80% at 50% 50%,rgba(124,58,237,0.22),transparent 70%),linear-gradient(180deg,rgba(23,11,51,0.55),rgba(15,8,35,0.72)); border: 1px solid ${C.hairline}; display: flex; flex-direction: column; align-items: center; gap: 18px; overflow: hidden; }
        @media (min-width: 880px) {
          .sv-an-stepper { display: inline-flex; }
          .sv-an-badge { display: none; }
          .sv-an-shell { padding: 36px 36px 96px; }
          .sv-an-stage { grid-template-columns: minmax(0,1fr) minmax(0,1.2fr); gap: 32px; align-items: center; }
          .sv-an-hero { padding: 56px 32px; aspect-ratio: 4/5; max-height: 600px; }
        }
        @media (max-width: 480px) {
          .sv-an-shell { padding: 16px 16px 60px; }
          .sv-an-topbar-inner { padding: 12px 16px; }
        }
      `}</style>

      {/* ── sticky topbar ── */}
      <header className="sv-an-topbar">
        <div className="sv-an-topbar-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="SyncVision" style={{ height: 28, width: 'auto', display: 'block' }} />
            <span style={{ width: 1, height: 16, background: C.hairlineStrong, display: 'inline-block' }} />
            <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: C.lavender }}>analyzing</span>
          </div>
          <nav className="sv-an-stepper" aria-label="Progress">
            <span className="sv-an-step done"><span className="n"><svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M5 12 L10 17 L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></span> Brief</span>
            <span className="sv-an-tick" />
            <span className="sv-an-step done"><span className="n"><svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M5 12 L10 17 L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></span> Ingest</span>
            <span className="sv-an-tick" />
            <span className="sv-an-step active"><span className="n">3</span> Match</span>
          </nav>
          <span className="sv-an-badge">Step <b>3</b> of 3</span>
        </div>
      </header>

      <main className="sv-an-shell">

        {/* ── hero row ── */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.lavender, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 24, height: 1, background: `linear-gradient(90deg,${C.magenta},transparent)`, display: 'inline-block' }} />
              Matching
            </span>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(24px,3.8vw,48px)', lineHeight: 1.02, letterSpacing: '-0.02em', color: C.silver }}>
              Listening for the <em style={{ fontStyle: 'italic', color: C.lavender }}>scene.</em>
            </h1>
          </div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(13px,1.3vw,16px)', color: 'rgba(167,139,250,0.7)', marginLeft: 'auto' }}>
            Hold tight — about 30 seconds.
          </div>
        </div>

        {isError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '48px 0' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.amber }}>
              {phase === 'timed-out' ? 'Taking longer than expected' : 'Something went wrong'}
            </div>
            <p style={{ fontSize: 14, color: C.silver, textAlign: 'center', maxWidth: 360, lineHeight: 1.6, fontFamily: SERIF, fontStyle: 'italic' }}>
              {error ?? 'Something went wrong while analyzing your tracks.'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onRetry} style={{ padding: '12px 22px', minHeight: 44, borderRadius: 12, background: `linear-gradient(135deg, ${C.purple}, ${C.magenta})`, color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', fontFamily: SANS }}>Try again</button>
              <button type="button" onClick={onBackToIngest} style={{ padding: '12px 22px', minHeight: 44, borderRadius: 12, background: 'transparent', color: C.silver, fontWeight: 700, fontSize: 13, border: `1px solid ${C.hairlineStrong}`, cursor: 'pointer', fontFamily: SANS }}>Back to tracks</button>
            </div>
          </div>
        ) : (
          <section className="sv-an-stage">

            {/* ── hero visual ── */}
            <div className="sv-an-hero">
              <div style={{ width: 'clamp(160px,22vw,240px)', aspectRatio: '1', position: 'relative' }}>
                <div className="sv-pulse-ring" style={{ animationDelay: '0s' }} />
                <div className="sv-pulse-ring" style={{ animationDelay: '0.65s' }} />
                <div className="sv-pulse-ring" style={{ animationDelay: '1.3s' }} />
                <div
                  className="sv-spin-core"
                  style={{ position: 'absolute', inset: '22%', borderRadius: '50%', background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.18), transparent 60%), conic-gradient(from 0deg, ${C.purple}, ${C.magenta}, ${C.purple})`, boxShadow: '0 0 80px rgba(124,58,237,0.5), inset 0 0 0 1px rgba(255,255,255,0.1)' }}
                >
                  <div style={{ position: 'absolute', inset: '12%', borderRadius: '50%', background: '#07041a', boxShadow: 'inset 0 0 0 1px rgba(167,139,250,0.2)' }} />
                </div>
                <div style={{ position: 'absolute', inset: '34%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, zIndex: 2 }}>
                  {[30, 60, 90, 70, 40].map((h, i) => (
                    <i key={i} className="sv-eq-bar" style={{ height: `${h}%`, animationDelay: `${[0, 0.15, 0.05, 0.25, 0.1][i]}s` }} />
                  ))}
                </div>
              </div>

              <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(36px,5vw,64px)', lineHeight: 1, letterSpacing: '-0.02em', color: C.silver, fontWeight: 400, textAlign: 'center' }}>
                Listening<span className="sv-dot" style={{ animationDelay: '0s' }}>.</span><span className="sv-dot" style={{ animationDelay: '0.2s' }}>.</span><span className="sv-dot" style={{ animationDelay: '0.4s' }}>.</span>
              </div>
              <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, textAlign: 'center' }}>
                matching your scene
              </div>
            </div>

            {/* ── progress panel ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <span style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.lavender }}>Status</span>
                {elapsedSec > 0 && (
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'rgba(167,139,250,0.7)', letterSpacing: '0.04em' }}>
                    {elapsedSec}s elapsed
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, background: 'linear-gradient(180deg,rgba(124,58,237,0.14),rgba(124,58,237,0.04))', border: `1px solid rgba(167,139,250,0.3)`, position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(124,58,237,0.24)', border: '1px solid rgba(167,139,250,0.5)', display: 'grid', placeItems: 'center', color: C.silver, flexShrink: 0 }}>
                  <div style={{ width: 13, height: 13, borderRadius: '50%', border: `1.5px solid rgba(255,255,255,0.15)`, borderTopColor: C.magenta, animation: 'sv-spin 0.9s linear infinite' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: C.silver, fontWeight: 600, letterSpacing: '-0.005em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {PHASE_STAGE[phase] ?? 'Analyzing…'}
                    <span aria-hidden style={{ display: 'inline-flex', gap: 3 }}>
                      {[0, 0.2, 0.4].map(delay => (
                        <span key={delay} className="sv-dot" style={{ animationDelay: `${delay}s`, fontSize: 14, lineHeight: 1 }} />
                      ))}
                    </span>
                  </div>
                  <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: C.lavender, marginTop: 3 }}>
                    Scene fit lands first. Rights take longest.
                  </div>
                </div>
                <div style={{ position: 'absolute', left: 0, bottom: 0, height: 2, background: `linear-gradient(90deg, ${C.purple}, ${C.magenta})`, boxShadow: '0 0 8px rgba(219,39,119,0.5)', width: '60%', animation: 'sv-analyzing 1.4s ease-in-out infinite' }} />
              </div>

              {warning && (
                <div style={{ fontSize: 11, color: C.amber, padding: '8px 12px', borderRadius: 10, background: 'rgba(245,181,68,0.08)', border: '1px solid rgba(245,181,68,0.2)' }}>{warning}</div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8, paddingTop: 14, borderTop: `1px solid ${C.hairline}` }}>
                <span style={{ fontFamily: SERIF, fontStyle: 'italic', color: 'rgba(167,139,250,0.65)', fontSize: 14 }}>
                  Usually under 30s
                </span>
                <button type="button" onClick={onBackToIngest} style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, padding: '9px 16px', minHeight: 44, borderRadius: 999, background: 'transparent', border: `1px solid ${C.hairlineStrong}`, cursor: 'pointer', fontFamily: SANS }}>
                  Cancel
                </button>
              </div>
            </div>

          </section>
        )}
      </main>
    </div>
  );
}
