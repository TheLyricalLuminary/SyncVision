import { useState, useRef } from 'react';

const STORAGE_KEY = 'sv_auth';

interface Props {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const expected = import.meta.env.VITE_APP_PASSWORD || 'Unity';
    if (password === expected) {
      setError(false);
      setUnlocked(true);
      sessionStorage.setItem(STORAGE_KEY, '1');
      setTimeout(() => onUnlock(), 650);
    } else {
      setError(true);
      setPassword('');
      const el = shellRef.current;
      if (el) {
        el.classList.remove('sv2-shake');
        void el.offsetWidth;
        el.classList.add('sv2-shake');
      }
    }
  }

  function handleInput(v: string) {
    setPassword(v);
    setError(false);
    shellRef.current?.classList.remove('sv2-shake');
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        .sv2-root {
          min-height: 100vh;
          display: grid;
          place-items: center;
          position: relative;
          overflow: hidden;
          font-family: "Manrope", system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
          background:
            radial-gradient(ellipse 80% 60% at 50% 20%, rgba(80,40,140,0.55) 0%, transparent 70%),
            radial-gradient(ellipse 60% 40% at 20% 80%, rgba(180,100,20,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 10%,  rgba(100,40,160,0.20) 0%, transparent 60%),
            radial-gradient(ellipse 100% 100% at 50% 50%, #0e0820 0%, #06030f 100%);
        }

        /* animated waveform — lower background */
        .sv2-wave {
          position: fixed;
          left: 0; right: 0;
          bottom: 18%;
          z-index: 0;
          opacity: 0.07;
          pointer-events: none;
        }
        .sv2-wave path {
          stroke-dasharray: 2400;
          stroke-dashoffset: 2400;
          animation: sv2WaveDraw 3.5s cubic-bezier(.4,0,.2,1) forwards,
                     sv2WavePulse 6s 3.5s ease-in-out infinite;
        }
        @keyframes sv2WaveDraw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes sv2WavePulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }

        /* frosted glass card */
        .sv2-card {
          position: relative;
          z-index: 2;
          width: min(420px, calc(100vw - 40px));
          padding: 44px 40px 36px;
          border-radius: 16px;
          background: rgba(22, 14, 42, 0.72);
          -webkit-backdrop-filter: blur(24px);
          backdrop-filter: blur(24px);
          box-shadow:
            0 0 0 1px rgba(160,120,255,0.10),
            0 8px 32px -8px rgba(0,0,0,0.6),
            0 0 80px -20px rgba(120,60,220,0.30),
            0 0 120px -40px rgba(245,147,24,0.12);
          text-align: center;
          animation: sv2Rise 0.75s cubic-bezier(.2,.8,.2,1) both;
        }
        @keyframes sv2Rise {
          from { opacity: 0; transform: translateY(20px) scale(.97); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes sv2FadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes sv2Shake {
          10%,90% { transform: translateX(-2px); }
          20%,80% { transform: translateX(3px); }
          30%,50%,70% { transform: translateX(-5px); }
          40%,60% { transform: translateX(5px); }
        }

        /* logo wordmark */
        .sv2-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 20px;
          animation: sv2FadeUp .7s .05s both;
        }

        /* eyebrow */
        .sv2-eyebrow {
          font-size: 10px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          font-weight: 700;
          color: rgba(160,140,210,0.65);
          margin-bottom: 10px;
          animation: sv2FadeUp .7s .12s both;
        }

        /* heading */
        .sv2-heading {
          font-family: "Instrument Serif", Georgia, serif;
          font-weight: 400;
          font-size: 28px;
          line-height: 1.2;
          color: #f0ecfa;
          margin: 0 0 10px;
          animation: sv2FadeUp .7s .18s both;
        }
        .sv2-heading em {
          font-style: italic;
          color: #F59318;
        }

        /* subtitle */
        .sv2-sub {
          font-family: "Instrument Serif", Georgia, serif;
          font-style: italic;
          font-size: 13.5px;
          color: rgba(160,148,200,0.6);
          line-height: 1.5;
          margin: 0 0 28px;
          animation: sv2FadeUp .7s .24s both;
        }

        /* form */
        .sv2-form { animation: sv2FadeUp .7s .30s both; }

        .sv2-label {
          display: block;
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          font-weight: 700;
          color: rgba(160,140,210,0.60);
          margin-bottom: 8px;
          text-align: left;
        }

        /* input shell */
        .sv2-shell {
          display: flex;
          align-items: center;
          background: rgba(8,4,18,0.75);
          border-radius: 10px;
          border: 1px solid rgba(140,110,220,0.18);
          transition: border-color .2s, box-shadow .2s;
          overflow: hidden;
        }
        .sv2-shell:focus-within {
          border-color: rgba(245,147,24,0.45);
          box-shadow: 0 0 0 3px rgba(245,147,24,0.10);
        }
        .sv2-shell.sv2-shake {
          animation: sv2Shake .4s;
          border-color: rgba(245,147,24,0.5);
        }
        .sv2-shell .sv2-ico {
          width: 44px;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          color: rgba(160,140,210,0.55);
        }
        .sv2-shell:focus-within .sv2-ico { color: #F59318; }
        .sv2-shell input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #f0ecfa;
          font-family: "Manrope", sans-serif;
          font-size: 15px;
          font-weight: 500;
          padding: 15px 12px 15px 0;
          letter-spacing: 0.03em;
        }
        .sv2-shell input::placeholder {
          color: rgba(160,140,210,0.35);
          font-weight: 400;
        }
        .sv2-reveal {
          width: 44px;
          flex-shrink: 0;
          background: transparent;
          border: 0;
          cursor: pointer;
          color: rgba(160,140,210,0.55);
          display: grid;
          place-items: center;
          transition: color .15s;
        }
        .sv2-reveal:hover { color: #f0ecfa; }

        /* error */
        .sv2-err {
          font-size: 12px;
          color: #F59318;
          margin-top: 9px;
          text-align: left;
          min-height: 16px;
        }

        /* button */
        .sv2-btn {
          width: 100%;
          margin-top: 16px;
          padding: 15px;
          border: 0;
          border-radius: 10px;
          cursor: pointer;
          font-family: "Manrope", sans-serif;
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 0.06em;
          color: #ffffff;
          background: linear-gradient(135deg, #F59318 0%, #C2410C 100%);
          box-shadow: 0 8px 24px -8px rgba(245,147,24,0.50);
          transition: transform .12s, box-shadow .18s, filter .18s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          position: relative;
          overflow: hidden;
        }
        .sv2-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 32px -8px rgba(194,65,12,0.60);
          filter: brightness(1.06);
        }
        .sv2-btn:active { transform: translateY(0); }
        .sv2-btn.ok {
          background: linear-gradient(135deg, #4ade80, #16a34a);
          box-shadow: 0 8px 24px -8px rgba(74,222,128,0.40);
        }

        /* foot */
        .sv2-foot {
          margin-top: 20px;
          font-size: 11px;
          color: rgba(160,140,210,0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          animation: sv2FadeUp .7s .38s both;
        }

        /* page footer */
        .sv2-pagefooter {
          position: fixed;
          bottom: 16px;
          left: 0; right: 0;
          z-index: 2;
          text-align: center;
          font-family: "JetBrains Mono", monospace;
          font-size: 9px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(140,120,190,0.28);
          pointer-events: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .sv2-card, .sv2-logo, .sv2-eyebrow, .sv2-heading,
          .sv2-sub, .sv2-form, .sv2-foot { animation: none !important; }
          .sv2-wave path { animation: none !important; stroke-dashoffset: 0; }
        }
      `}</style>

      <div className="sv2-root">

        {/* animated waveform — lower background */}
        <svg
          className="sv2-wave"
          height="90"
          width="100%"
          viewBox="0 0 1440 90"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M0,45 C80,45 90,45 140,45 C170,45 175,22 195,22 C212,22 215,68 228,68 C240,68 243,14 256,14 C270,14 273,76 286,76 C299,76 302,34 316,34 C332,34 348,45 390,45 C570,45 570,45 680,45 C706,45 710,25 728,25 C742,25 745,66 758,66 C770,66 773,17 786,17 C800,17 803,74 816,74 C829,74 832,36 846,36 C862,36 878,45 930,45 C1020,45 1050,45 1100,45 C1126,45 1130,25 1148,25 C1162,25 1165,66 1178,66 C1190,66 1193,17 1206,17 C1220,17 1223,74 1236,74 C1249,74 1252,36 1266,36 C1282,36 1298,45 1350,45 C1400,45 1420,45 1440,45"
            stroke="#F59318"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        {/* card */}
        <main className="sv2-card" role="dialog" aria-label="SyncVision sign in">

          {/* inline SVG wordmark */}
          <div className="sv2-logo" aria-label="SyncVision">
            <svg width="32" height="31" viewBox="0 0 48 46" fill="none" aria-hidden="true">
              <path
                fill="url(#sv2logoGrad)"
                d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
              />
              <defs>
                <linearGradient id="sv2logoGrad" x1="24" y1="0" x2="24" y2="46" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#d8b4fe"/>
                  <stop offset="1" stopColor="#a855f7"/>
                </linearGradient>
              </defs>
            </svg>
            <svg width="118" height="20" viewBox="0 0 118 20" fill="none" aria-hidden="true">
              <text
                x="0" y="16"
                fontFamily="Manrope, system-ui, sans-serif"
                fontWeight="700"
                fontSize="16"
                letterSpacing="0.5"
                fill="#f0ecfa"
              >
                SyncVision
              </text>
            </svg>
          </div>

          <div className="sv2-eyebrow">Private Preview</div>

          <h1 className="sv2-heading">
            The room is <em>locked.</em>
          </h1>

          <p className="sv2-sub">
            Enter the access key shared with you to open the shortlist.
          </p>

          <form className="sv2-form" onSubmit={handleSubmit} autoComplete="off" noValidate>
            <label className="sv2-label" htmlFor="sv2-pw">Access Key</label>

            <div className="sv2-shell" ref={shellRef}>
              <span className="sv2-ico" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="10.5" width="16" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.7"/>
                  <path d="M8 10.5V7.2a4 4 0 0 1 8 0V10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                  <circle cx="12" cy="15.4" r="1.5" fill="currentColor"/>
                </svg>
              </span>
              <input
                id="sv2-pw"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => handleInput(e.target.value)}
                placeholder="Enter password"
                aria-label="Password"
                autoFocus
              />
              <button
                type="button"
                className="sv2-reveal"
                aria-label={showPw ? 'Hide password' : 'Show password'}
                onClick={() => setShowPw(p => !p)}
              >
                {showPw ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.6"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.6"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/>
                  </svg>
                )}
              </button>
            </div>

            {error && (
              <div className="sv2-err" role="alert">Incorrect password</div>
            )}

            <button type="submit" className={`sv2-btn${unlocked ? ' ok' : ''}`}>
              {unlocked ? (
                <>
                  <span>Unlocked</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12L10 17L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              ) : (
                <span>Enter →</span>
              )}
            </button>
          </form>

          <div className="sv2-foot">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="4" y="10.5" width="16" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M8 10.5V7.2a4 4 0 0 1 8 0V10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            Encrypted link · expires Jul 1
          </div>

        </main>

        <div className="sv2-pagefooter">
          SyncVision · Deterministic Sync Intelligence
        </div>

      </div>
    </>
  );
}

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(STORAGE_KEY) === '1';
}
