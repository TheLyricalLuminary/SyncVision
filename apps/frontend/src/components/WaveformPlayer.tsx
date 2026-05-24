// apps/frontend/src/components/WaveformPlayer.tsx
import { useMemo, useState } from 'react';

interface WaveformPlayerProps {
  trackTitle: string;
  currentTime?: number;
  duration?: number;
  isPlaying?: boolean;
  onPlayToggle?: () => void;
  onScrub?: (time: number) => void;
  className?: string;
}

const BAR_COUNT = 48;

// Seeded pseudo-random so bar heights are stable across re-renders
// without needing an effect or external state.
function seededHeights(count: number): number[] {
  const out: number[] = [];
  let s = 0xdeadbeef;
  for (let i = 0; i < count; i++) {
    s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0);
    out.push((s % 65) + 20); // 20–84 %
  }
  return out;
}

function formatTime(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function WaveformPlayer({
  trackTitle,
  currentTime = 72,
  duration = 204,
  isPlaying = false,
  onPlayToggle,
  onScrub,
  className = '',
}: WaveformPlayerProps) {
  const [progress, setProgress] = useState((currentTime / duration) * 100);
  const barHeights = useMemo(() => seededHeights(BAR_COUNT), []);

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const next = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setProgress(next);
    onScrub?.(Math.round((next / 100) * duration));
  };

  const playedBars = Math.round((progress / 100) * BAR_COUNT);

  return (
    <div className={`bg-[#0F0823] border border-[#A78BFA]/20 rounded-3xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="font-medium text-white">{trackTitle}</div>
        <div className="font-mono text-xs text-[#A78BFA]/60">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* Waveform */}
      <div
        className="relative h-14 bg-black/40 rounded-2xl overflow-hidden cursor-pointer mb-4 group"
        onClick={handleScrub}
      >
        <div className="absolute inset-0 flex items-center justify-around px-3 gap-1">
          {barHeights.map((h, i) => (
            <div
              key={i}
              className="w-0.5 rounded-full transition-colors"
              style={{
                height: `${h}%`,
                background: i < playedBars
                  ? 'linear-gradient(to top, #7C3AED, #DB2777)'
                  : 'rgba(167,139,250,0.3)',
              }}
            />
          ))}
        </div>
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white transition-all duration-200"
          style={{ left: `${progress}%`, boxShadow: '0 0 8px #fff' }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-8">
        <button className="text-[#A78BFA]/70 hover:text-white transition-colors" aria-label="Skip back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>
          </svg>
        </button>

        <button
          onClick={onPlayToggle}
          className="w-14 h-14 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #DB2777)', boxShadow: '0 8px 24px rgba(124,58,237,0.4)' }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="white" aria-hidden>
              <rect x="3" y="2" width="6" height="18" rx="1.5"/>
              <rect x="13" y="2" width="6" height="18" rx="1.5"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="white" style={{ marginLeft: 3 }} aria-hidden>
              <polygon points="4,2 20,11 4,20"/>
            </svg>
          )}
        </button>

        <button className="text-[#A78BFA]/70 hover:text-white transition-colors" aria-label="Skip forward">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
