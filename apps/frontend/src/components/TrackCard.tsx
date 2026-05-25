import { useEffect, useRef, useState } from 'react';
import { API_BASE, type AnalysisResult } from '../utils/apiClient';
import { rightsDisplayFor } from '../utils/rightsStatus';
import { BRIEF_LABELS, type BriefId } from '../engine/classifyBrief';

function resolveAudioUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/') && API_BASE) return `${API_BASE}${path}`;
  return path;
}

type TrackCardProps = {
  result: AnalysisResult;
  briefId: BriefId;
  delta?: number | null;
};

const currentAudio: { el: HTMLAudioElement | null } = { el: null };

const BLOCKER_LABELS: Record<string, string> = {
  MASTER_PCT_UNSET: 'Master ownership unverified',
  ONE_STOP_NOT_CONFIRMED: 'One-stop unconfirmed',
  PRO_WORK_ID_MISSING: 'PRO work ID missing',
  WRITER_IPI_MISSING: 'Writer IPI missing',
  WRITER_UNIDENTIFIED: 'Writer unidentified',
  PUBLISHER_UNKNOWN: 'Publisher unknown',
};

function labelForBlocker(code: string): string {
  return BLOCKER_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function scoreColor(score: number): string {
  if (score >= 70) return '#34D399';
  if (score >= 55) return '#F5B544';
  return '#DB2777';
}

function AxisBar({ label, subLabel, pct }: { label: string; subLabel: string; pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase',
        color: '#A78BFA',
      }}>
        <span>
          {label}
          <span style={{ color: '#E2E8F0', fontWeight: 600, marginLeft: 4 }}>{subLabel}</span>
        </span>
        <span style={{ color: '#E2E8F0', fontFamily: 'monospace' }}>{clamped}%</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${clamped}%`,
          background: 'linear-gradient(90deg, #F5B544, #F97316)',
          borderRadius: 999,
        }} />
      </div>
    </div>
  );
}

export function TrackCard({ result, briefId, delta }: TrackCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rightsTooltipVisible, setRightsTooltipVisible] = useState(false);
  const [playbackMessageVisible, setPlaybackMessageVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioFilePath = resolveAudioUrl(result.track.audioFilePath);
  const hasAudio = audioFilePath !== null;

  const rights = rightsDisplayFor(result.rightsProfile);
  const score = result.confidenceScore.score;
  const isRank1 = result.rank === 1;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onDurationChange = () => setDuration(audio.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(audio.currentTime); };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      if (currentAudio.el === audio) currentAudio.el = null;
      audio.pause();
    };
  }, [audioFilePath]);

  const togglePlayback = () => {
    if (!hasAudio) { setPlaybackMessageVisible(true); return; }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    if (currentAudio.el && currentAudio.el !== audio) currentAudio.el.pause();
    currentAudio.el = audio;
    void audio.play().catch(() => setIsPlaying(false));
  };

  const timeLabel = duration > 0
    ? `${formatTime(currentTime)} / ${formatTime(duration)}`
    : formatTime(currentTime);

  const displayTitle = result.track.title.includes(' - ')
    ? result.track.title.slice(result.track.title.indexOf(' - ') + 3)
    : result.track.title;

  const cardBg = isRank1
    ? 'radial-gradient(160% 80% at 100% 0%, rgba(219,39,119,0.16), transparent 60%), linear-gradient(180deg, rgba(124,58,237,0.22), rgba(124,58,237,0.04) 70%)'
    : 'linear-gradient(180deg, rgba(124,58,237,0.08), rgba(124,58,237,0.02))';

  const cardBorder = isRank1
    ? 'rgba(167,139,250,0.34)'
    : 'rgba(167,139,250,0.14)';

  return (
    <article
      className="relative mb-4 overflow-hidden no-print"
      style={{
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        borderRadius: 16,
        boxShadow: isRank1 ? '0 20px 40px -22px rgba(124,58,237,0.35)' : undefined,
      }}
    >
      {/* Ghost rank number */}
      <span
        aria-hidden
        style={{
          position: 'absolute', top: -8, right: 14,
          fontFamily: '"Instrument Serif", serif',
          fontSize: 96, lineHeight: 1, fontWeight: 400,
          color: isRank1 ? 'rgba(255,255,255,0.10)' : 'rgba(167,139,250,0.10)',
          letterSpacing: '-0.04em',
          pointerEvents: 'none', userSelect: 'none',
        }}
      >
        {result.rank}
      </span>

      <div style={{ padding: '18px 20px 20px', position: 'relative' }}>

        {/* Title + artist */}
        <div style={{ paddingRight: 48, marginBottom: 10 }}>
          <h2 style={{
            fontFamily: '"Instrument Serif", serif',
            fontSize: 26, lineHeight: 1.05, fontWeight: 400,
            color: '#E2E8F0', letterSpacing: '-0.012em',
          }}>
            {displayTitle}
          </h2>
          {result.track.artistName && (
            <p style={{
              marginTop: 4,
              fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: '#A78BFA',
            }}>
              {result.track.artistName}
            </p>
          )}
        </div>

        {/* Chips row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
          {result.track.tempo != null && (
            <span className="chip" style={{
              fontFamily: 'monospace', fontSize: 11,
              background: 'rgba(124,58,237,0.16)', borderColor: 'rgba(124,58,237,0.36)',
              color: '#E2E8F0',
            }}>
              {result.track.tempo} BPM
            </span>
          )}
          {result.track.tonalCharacter && (
            <span className="chip">{result.track.tonalCharacter}</span>
          )}
          {result.track.energyCharacter && (
            <span className="chip">{result.track.energyCharacter}</span>
          )}
          <span className="relative">
            <span
              className="chip"
              style={{
                background: rights.bgColor,
                color: rights.color,
                borderColor: rights.borderColor,
                cursor: rights.clickable ? 'help' : undefined,
              }}
              onMouseEnter={() => rights.clickable && setRightsTooltipVisible(true)}
              onMouseLeave={() => setRightsTooltipVisible(false)}
              onClick={() => rights.clickable && setRightsTooltipVisible(v => !v)}
            >
              {rights.label}
            </span>
            {rightsTooltipVisible && (
              <span style={{
                position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
                width: 260, fontSize: 12, lineHeight: 1.5,
                borderRadius: 10, padding: '8px 12px', zIndex: 10,
                background: '#170B33', border: '1px solid rgba(167,139,250,0.2)',
                color: '#E2E8F0',
              }}>
                {rights.tooltip}
              </span>
            )}
          </span>
          <span className="chip" style={{ background: 'transparent', borderColor: 'rgba(167,139,250,0.22)', color: '#E2E8F0' }}>
            {BRIEF_LABELS[briefId]}
          </span>
        </div>

        {/* AI reasoning */}
        <div style={{
          marginBottom: 14,
          padding: '12px 14px',
          borderRadius: 12,
          background: 'linear-gradient(180deg, rgba(219,39,119,0.06), transparent)',
          border: '1px solid rgba(219,39,119,0.2)',
        }}>
          <div style={{
            fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase',
            color: '#DB2777', fontWeight: 700, marginBottom: 7,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" />
            </svg>
            Why this track
          </div>
          <p style={{
            fontFamily: '"Instrument Serif", serif',
            fontStyle: 'italic',
            fontSize: 15, lineHeight: 1.45,
            color: '#E2E8F0', letterSpacing: '-0.005em',
            margin: 0,
          }}>
            {result.confidenceScore.explanation}
          </p>
        </div>

        {/* Score + breakdown */}
        <div style={{
          padding: '12px 14px',
          borderRadius: 12,
          background: 'rgba(0,0,0,0.18)',
          border: '1px solid rgba(167,139,250,0.12)',
          marginBottom: 14,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 12,
          }}>
            <span style={{
              fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase',
              color: '#A78BFA',
            }}>
              Fit · breakdown
            </span>
            <span style={{
              fontFamily: '"Instrument Serif", serif',
              fontStyle: 'italic',
              fontSize: 24, lineHeight: 1,
              color: scoreColor(score),
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.01em',
            }}>
              {score}
              <span style={{
                fontFamily: 'system-ui, sans-serif',
                fontStyle: 'normal',
                fontSize: 10, color: '#A78BFA', marginLeft: 2,
              }}>/100</span>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            <AxisBar label="Scene"  subLabel="fit"     pct={result.confidenceScore.sceneFitBreakdown} />
            <AxisBar label="Rights" subLabel="clarity" pct={result.confidenceScore.rightsBreakdown} />
            <AxisBar label="Lyrics" subLabel="fit"     pct={result.confidenceScore.lyricsBreakdown} />
            <AxisBar label="Signal" subLabel="quality" pct={result.confidenceScore.signalBreakdown} />
          </div>
        </div>

        {/* Blockers */}
        {result.rightsProfile?.blockers && result.rightsProfile.blockers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {result.rightsProfile.blockers.map((code) => (
              <span key={code} className="chip" style={{
                border: '1px solid rgba(245,181,68,0.4)',
                color: '#F5B544',
                background: 'rgba(245,181,68,0.08)',
              }}>
                {labelForBlocker(code)}
              </span>
            ))}
          </div>
        )}

        {/* Waveform player */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 11px 9px 9px',
          borderRadius: 12,
          background: 'rgba(0,0,0,0.28)',
          border: '1px solid rgba(167,139,250,0.12)',
        }}>
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={isPlaying ? 'Pause track' : 'Play track'}
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              display: 'grid', placeItems: 'center',
              background: isRank1
                ? 'linear-gradient(135deg, #7C3AED, #DB2777)'
                : '#E2E8F0',
              color: isRank1 ? '#fff' : '#0F0823',
              border: 'none',
              boxShadow: isRank1 ? '0 8px 16px -8px rgba(219,39,119,0.5)' : undefined,
            }}
          >
            {isPlaying ? (
              <svg width="11" height="11" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
                <rect x="1.5" y="1" width="2.5" height="8" />
                <rect x="6" y="1" width="2.5" height="8" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
                <path d="M2 1 L8 5 L2 9 Z" />
              </svg>
            )}
          </button>

          {/* Mini waveform bars */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, height: 28, overflow: 'hidden' }}>
            {Array.from({ length: 40 }, (_, i) => {
              const heights = [30,55,40,72,50,90,60,35,65,48,78,42,62,38,55,80,45,60,30,70,42,55,36,50,65,40,58,32,48,55,38,60,42,50,30,45,38,52,34,48];
              const h = heights[i % heights.length];
              const played = duration > 0 && (i / 40) < (currentTime / duration);
              return (
                <span key={i} style={{
                  display: 'block', width: 2, flexShrink: 0,
                  height: `${h}%`,
                  borderRadius: 2,
                  background: played
                    ? 'linear-gradient(180deg, #7C3AED, #DB2777)'
                    : 'rgba(167,139,250,0.3)',
                }} />
              );
            })}
          </div>

          <span style={{
            fontFamily: 'monospace',
            fontSize: 10, color: '#A78BFA',
            letterSpacing: '0.05em', flexShrink: 0,
          }}>
            {timeLabel}
          </span>
        </div>

        {delta != null && delta > 0 && (
          <div style={{
            marginTop: 10,
            fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#A78BFA', opacity: 0.65,
          }}>
            −{delta} pts vs #1
          </div>
        )}

        {playbackMessageVisible && !hasAudio && (
          <p style={{ color: '#A78BFA', fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
            Audio playback coming soon.
          </p>
        )}

        {hasAudio && (
          <audio ref={audioRef} src={audioFilePath ?? undefined} preload="metadata" className="hidden" />
        )}
      </div>
    </article>
  );
}
