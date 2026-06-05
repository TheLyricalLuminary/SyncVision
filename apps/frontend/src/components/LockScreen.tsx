import { useState, useRef } from 'react';
import logo from '../assets/syncvision_logo.png';

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
        el.classList.remove('sv-shell-err');
        void el.offsetWidth;
        el.classList.add('sv-shell-err');
        el.addEventListener('animationend', () => el.classList.remove('sv-shell-err'), { once: true });
      }
    }
  }

  function handleInput(v: string) {
    setPassword(v);
    setError(false);
    shellRef.current?.classList.remove('sv-shell-err');
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        .sv-root {
          --bg-0: #08051A;
          --bg-1: #100A28;
          --silver: #F4F2FA;
          --lavender: #9B93C4;
          --amber: #F5A623;
          --magenta: #DB2777;
          --violet: #7C3AED;
          --good: #4CAF82;
          --bad: #E85A5A;
          --hairline: rgba(123,112,178,0.18);
          --hairline-strong: rgba(123,112,178,0.34);
          --ink-dim: rgba(155,147,196,0.6);
          font-family: "Manrope", system-ui, sans-serif;
          color: var(--silver);
          background: var(--bg-0);
          min-height: 100vh;
          display: grid;
          place-items: center;
          overflow: hidden;
          position: relative;
          -webkit-font-smoothing: antialiased;
        }

        /* ---- atmosphere ---- */
        .sv-field {
          position: fixed; inset: 0; z-index: 0; overflow: hidden;
          background:
            radial-gradient(900px 640px at 14% -6%,  rgba(245,166,35,0.16), transparent 56%),
            radial-gradient(880px 620px at 92% 8%,   rgba(219,39,119,0.18), transparent 56%),
            radial-gradient(1200px 800px at 50% 116%, rgba(124,58,237,0.20), transparent 66%),
            linear-gradient(165deg, var(--bg-1), var(--bg-0) 70%);
        }

        .sv-blob {
          position: absolute; border-radius: 50%;
          filter: blur(80px); opacity: 0.5; mix-blend-mode: screen;
        }
        .sv-blob-a {
          width: 520px; height: 520px; left: -90px; top: -120px;
          background: radial-gradient(circle, rgba(245,166,35,0.5), transparent 70%);
          animation: svDrift1 22s ease-in-out infinite;
        }
        .sv-blob-b {
          width: 560px; height: 560px; right: -120px; top: -80px;
          background: radial-gradient(circle, rgba(219,39,119,0.55), transparent 70%);
          animation: svDrift2 26s ease-in-out infinite;
        }
        .sv-blob-c {
          width: 640px; height: 640px; left: 30%; bottom: -260px;
          background: radial-gradient(circle, rgba(124,58,237,0.5), transparent 70%);
          animation: svDrift3 30s ease-in-out infinite;
        }
        @keyframes svDrift1 { 0%,100%{ transform:translate(0,0) scale(1); } 50%{ transform:translate(60px,40px) scale(1.1); } }
        @keyframes svDrift2 { 0%,100%{ transform:translate(0,0) scale(1); } 50%{ transform:translate(-50px,50px) scale(1.08); } }
        @keyframes svDrift3 { 0%,100%{ transform:translate(0,0) scale(1); } 50%{ transform:translate(40px,-40px) scale(1.12); } }

        /* grain */
        .sv-grain {
          position: fixed; inset: 0; z-index: 1;
          pointer-events: none; opacity: 0.4; mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.045 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        }

        /* waveform across center */
        .sv-wavebg {
          position: fixed; left: 0; right: 0;
          top: 50%; transform: translateY(-50%);
          z-index: 1; opacity: 0.10; pointer-events: none;
        }

        /* ---- card ---- */
        .sv-gate {
          position: relative; z-index: 2;
          width: min(420px, calc(100vw - 40px));
          padding: 44px 40px 36px;
          border-radius: 26px;
          background: linear-gradient(180deg, rgba(26,18,51,0.82), rgba(16,10,40,0.86));
          border: 1px solid var(--hairline-strong);
          box-shadow:
            0 40px 90px -38px rgba(0,0,0,0.85),
            0 0 0 1px rgba(255,255,255,0.02) inset,
            0 1px 0 rgba(255,255,255,0.06) inset;
          -webkit-backdrop-filter: blur(20px);
          backdrop-filter: blur(20px);
          text-align: center;
          animation: svRise 0.8s cubic-bezier(.2,.8,.2,1) both;
        }
        /* gradient hairline ring — amber→magenta→transparent via mask-composite */
        .sv-gate::before {
          content: ""; position: absolute; inset: 0;
          border-radius: 26px; padding: 1px;
          background: linear-gradient(135deg, rgba(245,166,35,0.5), rgba(219,39,119,0.45) 45%, transparent 70%);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }

        @keyframes svRise   { from { opacity:0; transform:translateY(22px) scale(.985); } to { opacity:1; transform:none; } }
        @keyframes svFadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
        @keyframes svShake  { 10%,90%{transform:translateX(-1px);} 20%,80%{transform:translateX(2px);} 30%,50%,70%{transform:translateX(-5px);} 40%,60%{transform:translateX(5px);} }
        @keyframes svSheen  { from { left:-60%; opacity:0.9; } to { left:130%; opacity:0; } }

        /* logo */
        .sv-logo-wrap {
          display: flex; justify-content: center; margin-bottom: 6px;
          animation: svFadeUp .8s .08s both;
        }
        .sv-logo-wrap img {
          height: 46px; width: auto;
          filter: drop-shadow(0 6px 24px rgba(219,39,119,0.35));
        }

        /* eyebrow */
        .sv-eyebrow {
          font-size: 10px; letter-spacing: 0.32em; text-transform: uppercase;
          color: var(--lavender); margin-top: 18px; font-weight: 600;
          animation: svFadeUp .8s .14s both;
        }

        /* title */
        .sv-title {
          font-family: "Instrument Serif", serif; font-weight: 400;
          font-size: 27px; letter-spacing: -0.01em; line-height: 1.15;
          margin: 7px 0 0; color: var(--silver);
          animation: svFadeUp .8s .2s both;
        }
        .sv-title em { font-style: italic; color: var(--amber); }

        /* sub */
        .sv-sub {
          font-family: "Instrument Serif", serif; font-style: italic;
          font-size: 14px; color: var(--ink-dim);
          margin: 9px 0 0; line-height: 1.45;
          animation: svFadeUp .8s .26s both;
        }

        /* form */
        .sv-form { margin-top: 28px; animation: svFadeUp .8s .32s both; }

        .sv-field-label {
          display: flex; align-items: center; margin-bottom: 8px;
        }
        .sv-field-label span {
          font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--lavender); font-weight: 700;
        }

        /* input shell */
        .sv-shell {
          position: relative; display: flex; align-items: center;
          border-radius: 14px;
          background: rgba(8,5,22,0.7);
          border: 1px solid var(--hairline-strong);
          transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
          overflow: hidden;
        }
        .sv-shell .sv-ico {
          display: grid; place-items: center;
          width: 46px; flex-shrink: 0;
          color: var(--lavender);
        }
        .sv-shell input {
          flex: 1; min-width: 0; border: 0; outline: 0; background: transparent;
          color: var(--silver); font-family: "Manrope", sans-serif;
          font-size: 15px; font-weight: 500;
          padding: 16px 14px 16px 0; letter-spacing: 0.04em;
        }
        .sv-shell input::placeholder {
          color: rgba(155,147,196,0.5); letter-spacing: 0.02em; font-weight: 400;
        }
        .sv-reveal {
          width: 46px; flex-shrink: 0; background: transparent; border: 0;
          cursor: pointer; color: var(--lavender);
          display: grid; place-items: center; transition: color .16s;
        }
        .sv-reveal:hover { color: var(--silver); }
        .sv-shell:focus-within {
          border-color: transparent;
          background: rgba(8,5,22,0.9);
          box-shadow: 0 0 0 1.5px rgba(245,166,35,0.55), 0 14px 34px -18px rgba(219,39,119,0.6);
        }
        .sv-shell:focus-within .sv-ico { color: var(--amber); }
        .sv-shell-err {
          border-color: var(--bad) !important;
          box-shadow: 0 0 0 1.5px rgba(232,90,90,0.6) !important;
          animation: svShake .42s;
        }

        /* error message */
        .sv-err-msg {
          font-size: 12px; color: var(--bad);
          margin-top: 10px; min-height: 16px;
          text-align: left;
          opacity: 0; transition: opacity .2s;
        }
        .sv-err-msg.show { opacity: 1; }

        /* submit button */
        .sv-btn {
          width: 100%; margin-top: 16px; padding: 16px; border: 0; cursor: pointer;
          border-radius: 14px; position: relative; overflow: hidden;
          font-family: "Manrope", sans-serif; font-weight: 700;
          font-size: 14px; letter-spacing: 0.04em;
          color: #1a0d02;
          background: linear-gradient(135deg, #FBBF24, var(--amber) 45%, var(--magenta) 130%);
          box-shadow: 0 16px 34px -14px rgba(245,166,35,0.6), 0 0 0 1px rgba(255,255,255,0.12) inset;
          transition: transform .12s ease, box-shadow .2s ease, filter .2s ease;
          display: inline-flex; align-items: center; justify-content: center; gap: 9px;
        }
        .sv-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 22px 42px -14px rgba(219,39,119,0.65), 0 0 0 1px rgba(255,255,255,0.16) inset;
        }
        .sv-btn:active { transform: translateY(0); }
        .sv-btn::after {
          content: ""; position: absolute; top: 0; bottom: 0; left: -60%; width: 45%;
          background: linear-gradient(105deg, transparent, rgba(255,255,255,0.45), transparent);
          transform: skewX(-18deg); opacity: 0;
        }
        .sv-btn:hover::after { animation: svSheen .9s ease; }
        .sv-btn.ok {
          background: linear-gradient(135deg, #5ED99B, var(--good));
          color: #042414;
          box-shadow: 0 16px 34px -14px rgba(76,175,130,0.6);
        }

        /* footer inside card */
        .sv-foot {
          margin-top: 22px; font-size: 11px; color: var(--ink-dim);
          display: flex; align-items: center; justify-content: center; gap: 8px;
          animation: svFadeUp .8s .4s both;
        }
        .sv-foot-lock { display: inline-flex; }

        /* page footer */
        .sv-verchip {
          position: fixed; bottom: 18px; left: 0; right: 0; z-index: 2;
          text-align: center;
          font-family: "JetBrains Mono", monospace;
          font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
          color: rgba(155,147,196,0.4);
        }

        @media (prefers-reduced-motion: reduce) {
          .sv-blob-a, .sv-blob-b, .sv-blob-c,
          .sv-gate, .sv-logo-wrap, .sv-eyebrow, .sv-title,
          .sv-sub, .sv-form, .sv-foot { animation: none !important; }
          .sv-btn:hover::after { animation: none; }
        }
      `}</style>

      <div className="sv-root">

        {/* z-index 0 — atmosphere field */}
        <div className="sv-field">
          <span className="sv-blob sv-blob-a" />
          <span className="sv-blob sv-blob-b" />
          <span className="sv-blob sv-blob-c" />
        </div>

        {/* z-index 1 — grain */}
        <div className="sv-grain" />

        {/* z-index 1 — waveform across center */}
        <svg className="sv-wavebg" height="120" width="100%" viewBox="0 0 1440 120"
          preserveAspectRatio="none" fill="none" aria-hidden="true">
          <path
            d="M0,60 C120,60 140,60 200,60 C240,60 250,30 280,30 C300,30 305,90 320,90
               C332,90 338,18 352,18 C366,18 372,102 386,102 C400,102 405,44 420,44
               C440,44 460,60 520,60 C760,60 760,60 900,60 C940,60 950,34 980,34
               C1000,34 1005,88 1020,88 C1032,88 1038,22 1052,22 C1066,22 1072,98 1086,98
               C1100,98 1105,48 1120,48 C1140,48 1160,60 1240,60 C1360,60 1380,60 1440,60"
            stroke="url(#svWgrad)" strokeWidth="2.5" strokeLinecap="round"
          />
          <defs>
            <linearGradient id="svWgrad" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="#F5A623" />
              <stop offset="0.5" stopColor="#DB2777" />
              <stop offset="1" stopColor="#7C3AED" />
            </linearGradient>
          </defs>
        </svg>

        {/* z-index 2 — card */}
        <main className="sv-gate" role="dialog" aria-label="SyncVision sign in">

          {/* 1. Logo */}
          <div className="sv-logo-wrap">
            <img src={logo} alt="SyncVision" />
          </div>

          {/* 2. Eyebrow */}
          <div className="sv-eyebrow">Private preview</div>

          {/* 3. Title */}
          <h1 className="sv-title">The room is <em>locked.</em></h1>

          {/* 4. Sub */}
          <p className="sv-sub">Enter the access key shared with you to open the shortlist.</p>

          {/* 5. Form */}
          <form className="sv-form" onSubmit={handleSubmit} autoComplete="off" noValidate>

            <div className="sv-field-label">
              <span>Access key</span>
            </div>

            <div className="sv-shell" ref={shellRef}>
              <span className="sv-ico" aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="10.5" width="16" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M8 10.5 V7.2 a4 4 0 0 1 8 0 V10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <circle cx="12" cy="15.4" r="1.5" fill="currentColor" />
                </svg>
              </span>

              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => handleInput(e.target.value)}
                placeholder="Enter password"
                aria-label="Password"
                autoFocus
              />

              <button
                type="button"
                className="sv-reveal"
                aria-label={showPw ? 'Hide password' : 'Show password'}
                onClick={() => setShowPw(p => !p)}
              >
                {showPw ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M2.5 12 S6 5.5 12 5.5 S21.5 12 21.5 12 S18 18.5 12 18.5 S2.5 12 2.5 12 Z" stroke="currentColor" strokeWidth="1.6" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M4 4 L20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M2.5 12 S6 5.5 12 5.5 S21.5 12 21.5 12 S18 18.5 12 18.5 S2.5 12 2.5 12 Z" stroke="currentColor" strokeWidth="1.6" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                )}
              </button>
            </div>

            {/* error message */}
            <div className={`sv-err-msg${error ? ' show' : ''}`} role="alert" aria-live="polite">
              That key didn't match. Try again.
            </div>

            {/* submit */}
            <button type="submit" className={`sv-btn${unlocked ? ' ok' : ''}`}>
              {unlocked ? (
                <>
                  <span>Unlocked</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12 L10 17 L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              ) : (
                <>
                  <span>Enter</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* 6. Card footer */}
          <div className="sv-foot">
            <span className="sv-foot-lock">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="10.5" width="16" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
                <path d="M8 10.5 V7.2 a4 4 0 0 1 8 0 V10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
            Encrypted link &middot; expires Jul 1
          </div>

        </main>

        {/* 7. Page footer */}
        <div className="sv-verchip">SyncVision &middot; deterministic sync intelligence</div>

      </div>
    </>
  );
}

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(STORAGE_KEY) === '1';
}
