import { useEffect, useRef, useState } from 'react';
import { API_BASE, type AnalysisResult } from '../utils/apiClient';
import { rightsBadgeLabel, rightsStatusFor } from '../utils/rightsStatus';
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
};

// Singleton so only one track plays at a time across all cards.
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
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function TrackCard({ result, briefId }: TrackCardProps) {
  const [playbackMessageVisible, setPlaybackMessageVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioFilePath = resolveAudioUrl(result.track.audioFilePath);
  const hasAudio = audioFilePath !== null;

  const rightsStatus = rightsStatusFor(result.rightsProfile);
  const rightsLabel = rightsBadgeLabel(rightsStatus);
  const score = result.confidenceScore.score;
  const fillPercent = Math.max(0, Math.min(100, score));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onDurationChange = () => setDuration(audio.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.currentTime);
    };

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
      if (currentAudio.el === audio) {
        currentAudio.el = null;
      }
      audio.pause();
    };
  }, [audioFilePath]);

  const togglePlayback = () => {
    if (!hasAudio) {
      setPlaybackMessageVisible(true);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (currentAudio.el && currentAudio.el !== audio) {
      currentAudio.el.pause();
    }
    currentAudio.el = audio;
    void audio.play().catch(() => {
      setIsPlaying(false);
    });
  };

  const timeLabel = duration > 0
    ? `${formatTime(currentTime)} / ${formatTime(duration)}`
    : formatTime(currentTime);

  return (
    <article className="card relative px-6 py-5 mb-3">
      <span
        className="absolute right-6 top-4 text-mg-silver text-4xl font-bold tabular-nums"
        style={{ opacity: 0.2 }}
        aria-hidden
      >
        {result.rank}
      </span>

      <header className="mb-3 pr-12">
        <h2 className="text-mg-silver font-bold text-lg">{result.track.title}</h2>
        {result.track.artistName && (
          <p className="text-mg-lavender text-sm font-light">
            {result.track.artistName}
          </p>
        )}
      </header>

      <div className="uppercase-label text-xs mb-2">
        {result.track.tempo != null ? `${result.track.tempo} BPM` : 'Tempo unknown'}
        {result.track.tonalCharacter ? ` · ${result.track.tonalCharacter}` : ''}
      </div>

      <div className="mb-3">
        <div
          className="w-full h-2 rounded"
          style={{ background: 'var(--color-mg-dim)' }}
          aria-hidden
        >
          <div
            className="h-2 rounded"
            style={{
              width: `${fillPercent}%`,
              background: 'var(--color-mg-lavender)',
              transition: 'width 150ms ease-out',
            }}
          />
        </div>
        <div className="text-mg-silver text-sm mt-1 tabular-nums">
          {score} / 100 · {result.confidenceScore.confidenceLabel}
        </div>
      </div>

      <p
        className="explanation text-mg-lavender italic text-sm mb-3 leading-relaxed"
      >
        {result.confidenceScore.explanation}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <span
          className="uppercase-label text-[10px] px-2 py-1 rounded"
          style={{
            background:
              rightsStatus === 'complete'
                ? 'rgba(72, 187, 165, 0.15)'
                : 'rgba(220, 170, 80, 0.15)',
            color:
              rightsStatus === 'complete' ? '#4abfa5' : '#dcaa50',
            border: `1px solid ${
              rightsStatus === 'complete' ? '#4abfa5' : '#dcaa50'
            }`,
          }}
        >
          {rightsLabel}
        </span>

        <span className="uppercase-label text-[10px]" style={{ opacity: 0.7 }}>
          {BRIEF_LABELS[briefId]}
        </span>

        <button
          type="button"
          onClick={togglePlayback}
          className="flex items-center gap-2 text-mg-silver text-xs px-3 py-1 rounded border border-mg-border ml-auto no-print"
          aria-label={isPlaying ? 'Pause track' : 'Play track'}
        >
          {isPlaying ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
              <rect x="1" y="0" width="3" height="10" />
              <rect x="6" y="0" width="3" height="10" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
              <polygon points="1,0 9,5 1,10" />
            </svg>
          )}
          <span className="tabular-nums">{timeLabel}</span>
        </button>
      </div>

      {result.rightsProfile?.blockers && result.rightsProfile.blockers.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {result.rightsProfile.blockers.map((code) => (
            <span
              key={code}
              className="uppercase-label text-[10px] px-2 py-0.5 rounded"
              style={{
                border: '1px solid #dcaa50',
                color: '#dcaa50',
                background: 'transparent',
              }}
            >
              {labelForBlocker(code)}
            </span>
          ))}
        </div>
      )}

      {hasAudio && (
        <audio
          ref={audioRef}
          src={audioFilePath ?? undefined}
          preload="metadata"
          className="hidden"
        />
      )}

      {playbackMessageVisible && !hasAudio && (
        <p className="text-mg-lavender text-xs mt-2 italic no-print">
          Audio playback coming soon.
        </p>
      )}
    </article>
  );
}
