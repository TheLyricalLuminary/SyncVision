// Design-canvas variant of TrackCard.
// Used inside <DCArtboard> / <DesignCanvas> prototypes.
// For the production results list, see TrackCard.tsx.
import { useState } from 'react';

interface DCTrackCardProps {
  rank?: number;
  title: string;
  artist?: string;
  bpm: number;
  mood: string;
  genre: string;
  score: number;
  narrative: string;
  isRank1?: boolean;
  rightsStatus?: 'clear' | 'unclear' | 'pending';
  isPlaying?: boolean;
  onPlayToggle?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  editable?: boolean;
}

export function DCTrackCard({
  rank,
  title,
  artist = 'Unknown Artist',
  bpm,
  mood,
  genre,
  score,
  narrative,
  isRank1 = false,
  rightsStatus = 'clear',
  isPlaying = false,
  onPlayToggle,
  onDragStart,
  editable = false,
}: DCTrackCardProps) {
  const [localNarrative, setLocalNarrative] = useState(narrative);

  const scoreColor = score >= 70 ? '#34D399' : score >= 55 ? '#F5B544' : '#DB2777';

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className={[
        'group relative bg-[#170B33] border border-[#A78BFA]/20 rounded-3xl p-5',
        'transition-all duration-300 hover:border-[#A78BFA]/40',
        isRank1 ? 'ring-1 ring-[#7C3AED]/50 shadow-2xl shadow-[#7C3AED]/20' : '',
      ].join(' ')}
    >
      {/* Ghosted rank */}
      {rank != null && (
        <div className="absolute -top-3 -right-3 font-serif text-7xl font-light text-[#A78BFA]/10 select-none pointer-events-none">
          {rank}
        </div>
      )}

      {/* Drag handle */}
      {onDragStart && (
        <div className="absolute top-5 left-5 opacity-40 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
          <svg width="9" height="13" viewBox="0 0 9 13" fill="#A78BFA">
            <circle cx="2" cy="2" r="1.1"/><circle cx="7" cy="2" r="1.1"/>
            <circle cx="2" cy="6.5" r="1.1"/><circle cx="7" cy="6.5" r="1.1"/>
            <circle cx="2" cy="11" r="1.1"/><circle cx="7" cy="11" r="1.1"/>
          </svg>
        </div>
      )}

      <div className="pl-8">
        {/* Title + play button */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-serif text-2xl leading-tight text-white tracking-[-0.02em]">
              {title}
            </h3>
            <p className="text-[#A78BFA]/70 text-sm mt-1">{artist}</p>
          </div>

          <button
            onClick={onPlayToggle}
            className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor" aria-hidden>
                <rect x="0" y="0" width="4" height="12" rx="1"/>
                <rect x="7" y="0" width="4" height="12" rx="1"/>
              </svg>
            ) : (
              <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor" style={{ marginLeft: 2 }} aria-hidden>
                <polygon points="0,0 11,6.5 0,13"/>
              </svg>
            )}
          </button>
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2 mt-5">
          <span className="chip">{bpm} BPM</span>
          <span className="chip">{mood}</span>
          <span className="chip">{genre}</span>
          {rightsStatus === 'unclear' && (
            <span className="chip" style={{ background: 'rgba(245,181,68,0.10)', border: '1px solid rgba(245,181,68,0.30)', color: '#F5B544' }}>
              RIGHTS UNCLEAR
            </span>
          )}
          {rightsStatus === 'pending' && (
            <span className="chip" style={{ background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.30)', color: '#A78BFA' }}>
              RIGHTS PENDING
            </span>
          )}
        </div>

        {/* Score bar */}
        <div className="mt-6 flex items-center gap-4">
          <div className="flex-1 h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${score}%`, background: 'linear-gradient(90deg, #7C3AED, #DB2777)' }}
            />
          </div>
          <div className="font-mono text-xl font-semibold tabular-nums" style={{ color: scoreColor }}>
            {score}
            <span className="text-xs align-super text-white/40">/100</span>
          </div>
        </div>

        {/* Narrative */}
        {editable ? (
          <textarea
            value={localNarrative}
            onChange={(e) => setLocalNarrative(e.target.value)}
            className="mt-5 w-full bg-transparent border border-white/10 rounded-2xl p-4 text-sm text-white/80 resize-y min-h-[72px] focus:border-[#7C3AED]/50"
          />
        ) : (
          <p className="mt-5 text-white/70 text-[15px] leading-relaxed font-light italic border-l-2 border-[#A78BFA]/30 pl-4">
            "{localNarrative}"
          </p>
        )}
      </div>
    </div>
  );
}
