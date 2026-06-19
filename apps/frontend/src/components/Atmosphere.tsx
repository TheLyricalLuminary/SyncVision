import './Atmosphere.css';

type AtmosphereProps = {
  /** Show the faint gold→magenta→violet waveform line across the page. */
  wave?: boolean;
};

/**
 * Story Match 2.0 ambient field — slow-drifting aurora blobs, film grain, and an
 * optional waveform line. Render once as the first child of a screen; all content
 * sits above it (z-index 0). Honours prefers-reduced-motion.
 */
export function Atmosphere({ wave = false }: AtmosphereProps) {
  return (
    <>
      <div className="sv-field" aria-hidden="true">
        <span className="sv-blob a" />
        <span className="sv-blob b" />
        <span className="sv-blob c" />
      </div>
      <div className="sv-grain" aria-hidden="true" />
      {wave && (
        <svg className="sv-wavebg" height="120" width="100%" viewBox="0 0 1440 120" preserveAspectRatio="none" fill="none" aria-hidden="true">
          <path
            d="M0,60 C120,60 140,60 200,60 C240,60 250,30 280,30 C300,30 305,90 320,90 C332,90 338,18 352,18 C366,18 372,102 386,102 C400,102 405,44 420,44 C440,44 460,60 520,60 C760,60 760,60 900,60 C940,60 950,34 980,34 C1000,34 1005,88 1020,88 C1032,88 1038,22 1052,22 C1066,22 1072,98 1086,98 C1100,98 1105,48 1120,48 C1140,48 1160,60 1240,60 C1360,60 1380,60 1440,60"
            stroke="url(#sv-wgrad)" strokeWidth="2.5" strokeLinecap="round"
          />
          <defs>
            <linearGradient id="sv-wgrad" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="#F5A623" />
              <stop offset="0.5" stopColor="#DB2777" />
              <stop offset="1" stopColor="#7C3AED" />
            </linearGradient>
          </defs>
        </svg>
      )}
    </>
  );
}
