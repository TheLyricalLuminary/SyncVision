import { useEffect, useRef, useState } from 'react';
import { API_BASE, type AnalysisResult, type SceneArc } from '../utils/apiClient';
import { ArcMatchGraph } from './ArcMatchGraph';
import type { LocalRightsOverride } from './RightsBlock';

const C = {
  purple:         '#F5A623',
  magenta:        '#DB2777',
  silver:         '#F4F2FA',
  lavender:       '#9B93C4',
  amber:          '#F5B544',
  hairline:       'rgba(123,112,178,0.16)',
  hairlineStrong: 'rgba(123,112,178,0.30)',
  good:           '#4CAF82',
  bad:            '#E85A5A',
  bpmBg:          'rgba(245,166,35,0.16)',
  bpmBorder:      'rgba(245,166,35,0.36)',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';

const currentAudio: { el: HTMLAudioElement | null } = { el: null };

const WAVE = [30,55,40,72,50,90,60,35,65,48,78,42,62,38,55,80,45,60,30,70,42,55,36,50,65,40,58,32,48,55];

function resolveAudioUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/') && API_BASE) return `${API_BASE}${path}`;
  return path;
}

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '00:00';
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function cleanTitle(raw: string): string {
  let t = raw;
  t = t.replace(/^[0-9a-f]{6,}_/i, '');
  t = t.replace(/_/g, ' ');
  t = t.replace(/\.(mp3|wav|flac|aiff?)$/i, '');
  t = t.replace(/\b(Official\s+Video|Official\s+Audio|Lyric\s+Video|HD|HQ|4K|Audio|Video|background\s+vocals?\s*\d*)\b/gi, '');
  t = t.replace(/\s+\d{1,3}\s*$/, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  if (t.includes(' - ')) t = t.slice(t.indexOf(' - ') + 3).trim();
  return t || raw;
}

// ── Decision-support scoring ─────────────────────────────────────────────────

type ClearabilityBand = 'low' | 'medium' | 'high';

function computeClearabilityConfidence(rp: AnalysisResult['rightsProfile']): { score: number; band: ClearabilityBand } {
  if (!rp) return { score: 20, band: 'low' };
  let score = 50;
  if (rp.rightsState === 'cleared')      score += 30;
  else if (rp.rightsState === 'blocked') score -= 40;
  if (rp.isOneStop)     score += 25;
  if (rp.isrc)          score +=  8;
  if (rp.publisherName) score += 10;
  if (rp.writerName)    score +=  5;
  if (rp.workId)        score +=  8;
  if (rp.splitPct != null && rp.splitPct < 100) score -= 10;
  const blockerCount = rp.blockers?.length ?? 0;
  if (blockerCount > 0) score -= Math.min(40, blockerCount * 15);
  score = Math.max(0, Math.min(100, score));
  const band: ClearabilityBand = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';
  return { score, band };
}

type ReplacementLabel = 'LOW' | 'MEDIUM' | 'HIGH';

function computeReplacementRisk(result: AnalysisResult, allResults: AnalysisResult[]): ReplacementLabel {
  const thisScore    = result.confidenceScore.arcMatch?.combinedScore ?? 0;
  const thisBlockers = result.rightsProfile?.blockers?.length ?? 0;
  const count = allResults.filter(r => {
    if (r.track.id === result.track.id) return false;
    const s = r.confidenceScore.arcMatch?.combinedScore ?? 0;
    const b = r.rightsProfile?.blockers?.length ?? 0;
    return s >= thisScore - 5 && b <= thisBlockers;
  }).length;
  if (count === 0) return 'LOW';
  if (count <= 3)  return 'MEDIUM';
  return 'HIGH';
}

type ActionTier = 'pursue' | 'fight' | 'escalate' | 'alternative' | 'backup' | 'deprioritize';
type ActionResult = { tier: ActionTier; label: string; sentence: string };

function buildRecommendedAction(fitScore: number, clearScore: number, repLabel: ReplacementLabel): ActionResult {
  const irreplaceable = repLabel === 'LOW';
  if (fitScore >= 75 && clearScore >= 70)
    return { tier: 'pursue', label: 'Lead with this one', sentence: 'Strong creative fit and clear rights — this is your fastest path to picture lock.' };
  if (fitScore >= 75 && clearScore >= 45)
    return irreplaceable
      ? { tier: 'fight', label: 'Fight for it', sentence: 'Best creative fit in the search. No substitute exists — clear the rights.' }
      : { tier: 'alternative', label: 'Find an alternative', sentence: 'Rights are shaky and alternatives exist — pressure-test a backup track first.' };
  if (fitScore >= 55 && clearScore >= 70)
    return { tier: 'backup', label: 'Hold in reserve', sentence: 'Easy to clear but not the first creative choice — keep as a safety net.' };
  if (irreplaceable && fitScore >= 55)
    return { tier: 'escalate', label: 'Escalate rights', sentence: 'No comparable alternatives found. Investigate clearance before moving on.' };
  if (fitScore >= 75)
    return { tier: 'alternative', label: 'Find an alternative', sentence: 'Rights are blocking this — comparable options exist in this search.' };
  return { tier: 'deprioritize', label: 'Deprioritise', sentence: 'Neither creative fit nor clearability justify the time investment right now.' };
}

const ACTION_COLOR: Record<ActionTier, string> = {
  pursue:       '#4CAF82',
  fight:        '#F5B544',
  escalate:     '#F5B544',
  alternative:  '#F5A623',
  backup:       '#9B93C4',
  deprioritize: '#E85A5A',
};

const CTA_LABEL: Record<ActionTier, string> = {
  pursue:       'Generate Pitch Link for Director →',
  fight:        'Generate Pitch Link for Director →',
  backup:       'Add to Shortlist as Backup →',
  escalate:     'Flag for Rights Research →',
  alternative:  'Find an Alternative →',
  deprioritize: 'Move to Considered →',
};

type Props = {
  result: AnalysisResult;
  allResults?: AnalysisResult[];
  sceneArc?: SceneArc | null;
  onShare?: () => void;
  onRightsSaved?: (trackId: string, override: LocalRightsOverride) => void;
  onMoveToConsidered?: (trackId: string) => void;
};

export function DecisionRail({ result, allResults = [], sceneArc, onShare, onMoveToConsidered }: Props) {
  const hasArcData = Boolean(
    result.confidenceScore.arcMatch &&
    result.confidenceScore.songArcCurve &&
    result.confidenceScore.songArcValenceCurve,
  );

  const [isPlaying,   setIsPlaying]   = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [playbackMsg, setPlaybackMsg] = useState(false);
  const [noteOpen,    setNoteOpen]    = useState(false);
  const [noteText,    setNoteText]    = useState('');
  const [audioError,  setAudioError]  = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioFilePath = resolveAudioUrl(result.track.audioFilePath);
  const hasAudio      = audioFilePath !== null;
  const title         = cleanTitle(result.track.title);
  const timeLabel     = duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : formatTime(currentTime);

  const localRights = result.rightsProfile;

  // Compute decision inputs
  const fitScore = result.confidenceScore.arcMatch?.combinedScore
    ?? Math.round((result.confidenceScore.vector.scene * 0.45 + result.confidenceScore.vector.lyrics * 0.25 + result.confidenceScore.vector.audioSignal * 0.20) * 100 / 0.90);
  const clearability  = computeClearabilityConfidence(localRights);
  const repLabel      = computeReplacementRisk(result, allResults);
  const action        = buildRecommendedAction(fitScore, clearability.score, repLabel);
  const actionColor   = ACTION_COLOR[action.tier];
  const ctaLabel      = CTA_LABEL[action.tier];
  const ctaIsPrimary  = action.tier === 'pursue' || action.tier === 'fight';
  const hasBlockers   = (localRights?.blockers?.length ?? 0) > 0;
  const rightsOk      = clearability.band === 'high';

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioError(null);
  }, [result.track.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime  = () => setCurrentTime(audio.currentTime);
    const onMeta  = () => setDuration(audio.duration);
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onError = () => { setAudioError('audio'); setIsPlaying(false); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      if (currentAudio.el === audio) currentAudio.el = null;
      audio.pause();
    };
  }, [audioFilePath]);

  const togglePlayback = () => {
    if (!hasAudio) { setPlaybackMsg(true); return; }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    if (currentAudio.el && currentAudio.el !== audio) currentAudio.el.pause();
    currentAudio.el = audio;
    void audio.play().catch(() => setIsPlaying(false));
  };

  return (
    <article style={{
      borderRadius: 20,
      padding: 22,
      background: 'linear-gradient(180deg,rgba(26,22,48,0.60),rgba(16,12,32,0.78))',
      border: `1px solid ${C.hairline}`,
    }}>

      {/* ── track header ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: C.magenta }}>#{result.rank}</span>

          {/* rights badge — simple, non-alarming */}
          {rightsOk ? (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 9px', borderRadius: 999, background: 'rgba(76,175,130,0.14)', border: '1px solid rgba(76,175,130,0.35)', color: C.good }}>
              ✓ Clearable
            </span>
          ) : hasBlockers ? (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 9px', borderRadius: 999, background: 'rgba(245,181,68,0.12)', border: '1px solid rgba(245,181,68,0.3)', color: C.amber }}>
              Rights need verification
            </span>
          ) : null}
        </div>

        <div style={{ fontFamily: SERIF, fontSize: 'clamp(18px,2.2vw,24px)', lineHeight: 1.1, letterSpacing: '-0.015em', color: C.silver }}>{title}</div>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: C.lavender, marginTop: 3 }}>
          {result.track.artistName ? `by ${result.track.artistName}` : 'Unknown artist'}
          {duration > 0 && ` · ${formatTime(duration)}`}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {result.track.tempo != null && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: C.bpmBg, border: `1px solid ${C.bpmBorder}`, color: C.silver, fontFamily: '"JetBrains Mono",monospace', letterSpacing: '0.04em' }}>
              {result.track.tempo} BPM
            </span>
          )}
          {result.track.tonalCharacter && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.30)', color: C.amber }}>
              {result.track.tonalCharacter}
            </span>
          )}
          {result.track.energyCharacter && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.30)', color: C.amber }}>
              {result.track.energyCharacter}
            </span>
          )}
        </div>
      </div>

      {/* ── player ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
        borderRadius: hasArcData && sceneArc ? '12px 12px 0 0' : 12,
        background: 'rgba(0,0,0,0.32)', border: `1px solid ${C.hairline}`,
        borderBottom: hasArcData && sceneArc ? 'none' : `1px solid ${C.hairline}`,
        marginBottom: 0,
      }}>
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg,${C.purple},${C.magenta})`, border: 0, color: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: `0 8px 18px -8px rgba(245,166,35,0.55)${isPlaying ? ', 0 0 0 3px rgba(245,166,35,0.22)' : ''}`, flexShrink: 0, transition: 'box-shadow 0.2s' }}
        >
          {isPlaying
            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1" width="2.5" height="8"/><rect x="6" y="1" width="2.5" height="8"/></svg>
            : <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1 L8 5 L2 9 Z"/></svg>
          }
        </button>

        <div
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 32, cursor: 'pointer' }}
          onPointerDown={e => {
            const el = e.currentTarget;
            const seek = (ev: PointerEvent) => {
              const r = el.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
              if (audioRef.current) audioRef.current.currentTime = ratio * (audioRef.current.duration || 0);
            };
            seek(e.nativeEvent);
            const move = (ev: PointerEvent) => seek(ev);
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        >
          {WAVE.map((h, i) => {
            const played = duration > 0 && (i / WAVE.length) < (currentTime / duration);
            return <span key={i} style={{ display: 'block', flex: 1, minWidth: 2, height: `${h}%`, borderRadius: 2, background: played ? `linear-gradient(180deg,${C.magenta},${C.purple})` : 'rgba(167,139,250,0.28)', transition: 'background 0.1s' }} />;
          })}
        </div>

        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 10, color: C.lavender, letterSpacing: '0.04em', flexShrink: 0 }}>
          {audioError ? 'N/A' : timeLabel}
        </span>
      </div>

      {playbackMsg && !hasAudio && (
        <p style={{ fontSize: 11, color: C.lavender, marginTop: 5, fontStyle: 'italic' }}>Audio preview not available for this track.</p>
      )}

      {/* ── arc match graph — graph tells the story, no numbers ── */}
      {hasArcData && sceneArc && (
        <div style={{ border: `1px solid ${C.hairline}`, borderTop: 'none', borderRadius: '0 0 14px 14px', overflow: 'hidden', marginBottom: 4 }}>
          <ArcMatchGraph
            sceneArc={sceneArc}
            songArcCurve={result.confidenceScore.songArcCurve!}
            songArcValenceCurve={result.confidenceScore.songArcValenceCurve!}
            arcMatch={result.confidenceScore.arcMatch!}
            playheadFraction={duration > 0 ? currentTime / duration : undefined}
          />
        </div>
      )}

      {/* ── human-readable explanation — the real "why" ── */}
      <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, borderLeft: `2px solid ${C.magenta}`, background: 'rgba(219,39,119,0.04)', fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(13px,1.3vw,15px)', lineHeight: 1.5, color: C.silver }}>
        {result.confidenceScore.explanation}
      </div>

      {/* ── action verdict ── */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: actionColor, fontWeight: 700, marginBottom: 6 }}>
          {action.label}
        </div>
        <p style={{ margin: '0 0 18px', fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, lineHeight: 1.5, color: 'rgba(244,242,250,0.8)' }}>
          {action.sentence}
        </p>

        {/* primary CTA — hero button */}
        <button
          type="button"
          onClick={ctaIsPrimary ? onShare : () => onMoveToConsidered?.(result.track.id)}
          style={{
            width: '100%',
            padding: '15px 20px',
            borderRadius: 12,
            border: 0,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: SANS,
            letterSpacing: '0.01em',
            color: '#fff',
            background: ctaIsPrimary
              ? `linear-gradient(135deg, ${C.good} 0%, #2E7D56 100%)`
              : action.tier === 'backup' || action.tier === 'escalate'
                ? `linear-gradient(135deg, ${C.amber}, #C68B00)`
                : `linear-gradient(135deg, rgba(123,112,178,0.5), rgba(90,80,140,0.5))`,
            boxShadow: ctaIsPrimary
              ? '0 16px 40px -12px rgba(76,175,130,0.6)'
              : '0 8px 20px -8px rgba(0,0,0,0.4)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
        >
          {ctaLabel}
        </button>
      </div>

      {/* ── secondary actions ── */}
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        {ctaIsPrimary && (
          <button
            type="button"
            onClick={() => onMoveToConsidered?.(result.track.id)}
            style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: `1px solid ${C.hairlineStrong}`, background: 'rgba(167,139,250,0.06)', color: C.lavender, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}
          >
            Move to Considered
          </button>
        )}
        <button
          type="button"
          onClick={() => setNoteOpen(v => !v)}
          style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: `1px solid ${noteOpen ? 'rgba(219,39,119,0.3)' : C.hairlineStrong}`, background: noteOpen ? 'rgba(219,39,119,0.08)' : 'rgba(167,139,250,0.06)', color: noteOpen ? C.silver : C.lavender, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}
        >
          {noteOpen ? 'Close note' : '+ Note'}
        </button>
      </div>

      {noteOpen && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 10, background: noteText ? 'linear-gradient(180deg,rgba(219,39,119,0.08),transparent)' : 'rgba(0,0,0,0.28)', border: `1px solid ${noteText ? 'rgba(219,39,119,0.3)' : C.hairline}` }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: C.magenta, flexShrink: 0 }}><path d="M4 5 H20 V17 H10 L6 21 V17 H4 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
          <input
            type="text"
            placeholder="Add a note for the director…"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: C.silver, fontFamily: SANS, fontSize: 12 }}
          />
        </div>
      )}

      {hasAudio && <audio ref={audioRef} src={audioFilePath!} preload="metadata" />}
    </article>
  );
}
