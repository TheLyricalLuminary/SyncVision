// apps/frontend/src/components/ScoreVisualization.tsx
type Variant = 'bar' | 'pills' | 'radar' | 'mini';

interface ScoreBreakdown {
  overall: number;
  tempo: number;
  mood: number;
  energy: number;
  structure: number;
}

interface ScoreVisualizationProps {
  score: number;
  breakdown?: Partial<ScoreBreakdown>;
  variant?: Variant;
  size?: 'small' | 'medium' | 'large';
  animated?: boolean;
}

export function ScoreVisualization({
  score,
  breakdown,
  variant = 'bar',
  size = 'medium',
  animated = true,
}: ScoreVisualizationProps) {
  const scoreColor = score >= 72 ? '#34D399' : score >= 58 ? '#F5B544' : '#DB2777';

  if (variant === 'pills') {
    return (
      <div className="flex flex-wrap gap-2">
        {breakdown && Object.entries(breakdown).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-2">
            <span className="text-xs uppercase tracking-widest text-[#A78BFA]/70">{key}</span>
            <span className="font-mono font-semibold text-lg" style={{ color: scoreColor }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'radar') {
    return (
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <linearGradient id="sv-score-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7C3AED" />
              <stop offset="100%" stopColor="#DB2777" />
            </linearGradient>
          </defs>
          <polygon points="50,10 85,35 75,75 25,75 15,35" fill="none" stroke="#A78BFA" strokeWidth="1" opacity="0.2" />
          <polygon
            points="50,10 85,35 75,75 25,75 15,35"
            fill="none"
            stroke="url(#sv-score-gradient)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl font-light font-mono" style={{ color: scoreColor }}>{score}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/40 -mt-1">FIT</div>
          </div>
        </div>
      </div>
    );
  }

  // Default: horizontal bar
  return (
    <div className={`flex items-center gap-4 ${size === 'small' ? 'text-sm' : ''}`}>
      <div className="flex-1">
        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${animated ? 'transition-all duration-1000' : ''}`}
            style={{
              width: `${score}%`,
              background: 'linear-gradient(90deg, #7C3AED, #DB2777)',
              boxShadow: '0 0 12px rgba(124,58,237,0.5)',
            }}
          />
        </div>
      </div>
      <div className="font-mono font-semibold tabular-nums text-2xl" style={{ color: scoreColor }}>
        {score}
        <span className="text-xs align-super text-white/40">/100</span>
      </div>
    </div>
  );
}
