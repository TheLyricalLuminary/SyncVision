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

function SvLogo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, letterSpacing: '-0.01em', fontFamily: SANS }}>
      <span className="sv-glyph" style={{ width: 22, height: 22, borderRadius: 7, position: 'relative', flexShrink: 0, background: `conic-gradient(from 210deg at 50% 50%, ${C.purple}, ${C.magenta}, ${C.purple})`, boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset' }} />
      <span style={{ fontSize: 15 }}><b>SyncVision</b></span>
    </span>
  );
}

const PHASE_STAGE: Partial<Record<JobPhase, string>> = {
  submitting:  'Sending your tracks…',
  pending:     'In queue…',
  processing:  'Checking rights clearance…',
};

export function AnalyzingScreen({ phase, warning, error, elapsedMs, onRetry, onBackToIngest }: AnalyzingScreenProps) {
  const isError  = phase === 'failed' || phase === 'timed-out';
  const elapsedSec = Math.floor(elapsedMs / 1000);

  return (
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: BG, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes sv-spin { to { transform: rotate(360deg); } }
        @keyframes sv-pulse { 0% { transform: scale(0.5); opacity: 0; } 20% { opacity: 0.7; } 100% { transform: scale(1.3); opacity: 0; } }
        @keyframes sv-eq { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
        @keyframes sv-dotwave { 0%, 100% { opacity: 0.25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }
        .sv-pulse-ring { position: absolute; inset: 0; border-radius: 50%; border: 1px solid rgba(167,139,250,0.3); animation: sv-pulse 2.6s ease-out infinite; }
        .sv-spin-core { animation: sv-spin 6s linear infinite; }
        .sv-eq-bar { display: block; width: 3px; border-radius: 2px; background: linear-gradient(180deg, ${C.magenta}, ${C.purple}); animation: sv-eq 1.1s ease-in-out infinite; }
        .sv-dot { display: inline-block; animation: sv-dotwave 1.4s ease-in-out infinite; color: ${C.magenta}; }
      `}</style>

      <div style={{ maxWidth: 520, width: '100%', margin: '0 auto', padding: '8px 20px 28px', display: 'flex', flexDirection: 'column', flex: 1 }}>

        {/* ── header ── */}
        <div style={{ padding: '16px 4px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
          <SvLogo />
          <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, padding: '4px 10px', borderRadius: 999, background: 'rgba(167,139,250,0.08)', border: `1px solid ${C.hairline}` }}>
            Step <b style={{ color: C.silver, fontWeight: 700 }}>3</b> of 3
          </span>
        </div>

        {isError ? (
          /* ── error state ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '32px 0' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.amber }}>
              {phase === 'timed-out' ? 'Taking longer than expected' : 'Something went wrong'}
            </div>
            <p style={{ fontSize: 14, color: C.silver, textAlign: 'center', maxWidth: 340, lineHeight: 1.6, fontFamily: SERIF, fontStyle: 'italic' }}>
              {error ?? 'Something went wrong while analyzing your tracks.'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onRetry} style={{ padding: '10px 18px', borderRadius: 11, background: `linear-gradient(135deg, ${C.purple}, ${C.magenta})`, color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', fontFamily: SANS }}>Try again</button>
              <button type="button" onClick={onBackToIngest} style={{ padding: '10px 18px', borderRadius: 11, background: 'transparent', color: C.silver, fontWeight: 700, fontSize: 13, border: `1px solid ${C.hairlineStrong}`, cursor: 'pointer', fontFamily: SANS }}>Back to tracks</button>
            </div>
          </div>
        ) : (
          <>
            {/* ── hero animation ── */}
            <div style={{ padding: '22px 4px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: `1px solid ${C.hairline}`, position: 'relative' }}>
              {/* spinning visual */}
              <div style={{ width: 130, height: 130, position: 'relative', marginBottom: 18 }}>
                <div className="sv-pulse-ring" style={{ animationDelay: '0s' }} />
                <div className="sv-pulse-ring" style={{ animationDelay: '0.65s' }} />
                <div className="sv-pulse-ring" style={{ animationDelay: '1.3s' }} />
                <div
                  className="sv-spin-core"
                  style={{ position: 'absolute', inset: 28, borderRadius: '50%', background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.18), transparent 60%), conic-gradient(from 0deg, ${C.purple}, ${C.magenta}, ${C.purple})`, boxShadow: '0 0 40px rgba(124,58,237,0.45), inset 0 0 0 1px rgba(255,255,255,0.1)' }}
                >
                  <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', background: '#0F0823', boxShadow: 'inset 0 0 0 1px rgba(167,139,250,0.2)' }} />
                </div>
                {/* equalizer bars */}
                <div style={{ position: 'absolute', inset: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, zIndex: 2 }}>
                  {[14, 22, 30, 24, 16].map((h, i) => (
                    <i key={i} className="sv-eq-bar" style={{ height: h, animationDelay: `${[0, 0.15, 0.05, 0.25, 0.1][i]}s` }} />
                  ))}
                </div>
              </div>

              <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 36, lineHeight: 1, letterSpacing: '-0.015em', color: C.silver, fontWeight: 400 }}>
                Listening<span className="sv-dot" style={{ animationDelay: '0s' }}>.</span><span className="sv-dot" style={{ animationDelay: '0.2s' }}>.</span><span className="sv-dot" style={{ animationDelay: '0.4s' }}>.</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavender }}>
                Matching tracks to your scene
              </div>
            </div>

            {/* ── progress row: single active row ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'linear-gradient(180deg, rgba(124,58,237,0.14), rgba(124,58,237,0.04))', border: '1px solid rgba(167,139,250,0.3)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(124,58,237,0.24)', border: '1px solid rgba(167,139,250,0.5)', display: 'grid', placeItems: 'center', color: C.silver, flexShrink: 0 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', border: `1.5px solid rgba(255,255,255,0.15)`, borderTopColor: C.magenta, animation: 'sv-spin 0.9s linear infinite' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.silver, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {PHASE_STAGE[phase] ?? 'Analyzing…'}
                    <span aria-hidden style={{ display: 'inline-flex', gap: 3 }}>
                      {[0, 0.2, 0.4].map(delay => (
                        <span key={delay} className="sv-dot" style={{ animationDelay: `${delay}s`, fontSize: 14, lineHeight: 1, color: C.magenta }} />
                      ))}
                    </span>
                  </div>
                  {elapsedSec > 0 && (
                    <div style={{ fontSize: 11, color: 'rgba(167,139,250,0.55)', marginTop: 2, letterSpacing: '0.04em' }}>
                      {elapsedSec}s
                    </div>
                  )}
                </div>
                {/* animated bottom bar */}
                <div style={{ position: 'absolute', left: 0, bottom: 0, height: 2, background: `linear-gradient(90deg, ${C.purple}, ${C.magenta})`, boxShadow: '0 0 8px rgba(219,39,119,0.5)', width: '60%', animation: 'sv-analyzing 1.4s ease-in-out infinite' }} />
                <style>{`@keyframes sv-analyzing { 0% { transform: translateX(-100%); } 100% { transform: translateX(180%); } }`}</style>
              </div>
            </div>

            {warning && (
              <div style={{ fontSize: 11, color: C.amber, marginTop: 8, textAlign: 'center' }}>{warning}</div>
            )}

            {/* ── footer ── */}
            <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${C.hairline}` }}>
              <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.55)' }}>
                Usually under 30s
              </span>
              <button type="button" onClick={onBackToIngest} style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, padding: '8px 14px', borderRadius: 999, background: 'transparent', border: `1px solid ${C.hairlineStrong}`, cursor: 'pointer', fontFamily: SANS }}>
                Cancel
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
