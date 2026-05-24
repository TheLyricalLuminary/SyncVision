import { useEffect, useRef, useState } from 'react';
import { API_BASE, type AnalysisResult, type SceneParams } from '../utils/apiClient';
import { rightsDisplayFor } from '../utils/rightsStatus';
import { BRIEF_LABELS, type BriefId } from '../engine/classifyBrief';

// ── design tokens ────────────────────────────────────────────
const C = {
  purple:        '#7C3AED',
  magenta:       '#DB2777',
  silver:        '#E2E8F0',
  lavender:      '#A78BFA',
  amber:         '#F5B544',
  amberSoft:     'rgba(245, 181, 68, 0.12)',
  amberBorder:   'rgba(245, 181, 68, 0.28)',
  hairline:      'rgba(167, 139, 250, 0.14)',
  hairlineStrong:'rgba(167, 139, 250, 0.22)',
  bg:            '#0F0823',
  chipBg:        'rgba(167,139,250,0.08)',
  bpmBg:         'rgba(124,58,237,0.16)',
  bpmBorder:     'rgba(124,58,237,0.36)',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';
const BG    = `radial-gradient(1200px 700px at 18% 0%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 600px at 82% 100%, rgba(219,39,119,0.10), transparent 60%), #06030F`;

// ── share payload ─────────────────────────────────────────────
type SharePayload = { briefText: string; briefId: BriefId; sceneParams: SceneParams; results: AnalysisResult[] };

function encodeSharePayload(p: SharePayload): string {
  const json = JSON.stringify(p);
  const utf8 = new TextEncoder().encode(json);
  let bin = '';
  utf8.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export function decodeSharePayload(encoded: string): SharePayload | null {
  try {
    const bin = atob(encoded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
  } catch { return null; }
}

// ── audio singleton ────────────────────────────────────────────
const currentAudio: { el: HTMLAudioElement | null } = { el: null };

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

function stripArtist(title: string) {
  return title.includes(' - ') ? title.slice(title.indexOf(' - ') + 3) : title;
}

// ── sub-components ─────────────────────────────────────────────
function SvLogo({ onClick }: { onClick?: () => void }) {
  return (
    <span onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined, display: 'inline-flex' }}>
      <img src="/logo.png" alt="SyncVision" style={{ height: 28, width: 'auto', display: 'block' }} />
    </span>
  );
}

function Chip({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'bpm' | 'warn' | 'genre' }) {
  const s: React.CSSProperties =
    variant === 'bpm'   ? { background: C.bpmBg, border: `1px solid ${C.bpmBorder}`, color: C.silver } :
    variant === 'warn'  ? { background: C.amberSoft, border: `1px solid ${C.amberBorder}`, color: C.amber } :
    variant === 'genre' ? { background: 'transparent', border: `1px solid ${C.hairlineStrong}`, color: C.silver } :
                          { background: C.chipBg, border: `1px solid ${C.hairline}`, color: C.lavender };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', padding: '4px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', ...s }}>
      {children}
    </span>
  );
}

// ── TrackCard (inlined for full visual control) ────────────────
function TrackCard({ result, briefId, topScore, isFirst }: { result: AnalysisResult; briefId: BriefId; topScore: number; isFirst: boolean }) {
  const [isPlaying, setIsPlaying]               = useState(false);
  const [currentTime, setCurrentTime]           = useState(0);
  const [duration, setDuration]                 = useState(0);
  const [rightsTooltip, setRightsTooltip]       = useState(false);
  const [playbackMsg, setPlaybackMsg]           = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioFilePath = resolveAudioUrl(result.track.audioFilePath);
  const hasAudio = audioFilePath !== null;
  const rights = rightsDisplayFor(result.rightsProfile);
  const score = result.confidenceScore.score;
  const fillPct = Math.max(0, Math.min(100, score));
  const delta = isFirst ? null : topScore - score;
  const title = stripArtist(result.track.title);
  const timeLabel = duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : formatTime(currentTime);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime    = () => setCurrentTime(audio.currentTime);
    const onMeta    = () => setDuration(audio.duration);
    const onPlay    = () => setIsPlaying(true);
    const onPause   = () => setIsPlaying(false);
    const onEnded   = () => { setIsPlaying(false); setCurrentTime(audio.currentTime); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
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
    <article
      style={{
        position: 'relative',
        background: isFirst
          ? 'linear-gradient(180deg, rgba(124,58,237,0.22), rgba(219,39,119,0.06) 70%, rgba(124,58,237,0.02))'
          : 'linear-gradient(180deg, rgba(124,58,237,0.07), rgba(124,58,237,0.02))',
        border: `1px solid ${isFirst ? 'rgba(167,139,250,0.34)' : C.hairline}`,
        boxShadow: isFirst ? '0 20px 40px -20px rgba(124,58,237,0.35)' : 'none',
        borderRadius: 16, padding: '12px 14px 11px', marginBottom: 10, overflow: 'hidden',
      }}
    >
      {/* ghosted rank */}
      <span aria-hidden style={{ position: 'absolute', top: 2, right: 14, fontFamily: SERIF, fontSize: 78, lineHeight: 1, color: isFirst ? 'rgba(255,255,255,0.10)' : 'rgba(167,139,250,0.10)', letterSpacing: '-0.04em', fontWeight: 400, pointerEvents: 'none', userSelect: 'none' }}>
        {result.rank}
      </span>

      {/* title */}
      <div style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1.1, fontWeight: 400, color: C.silver, letterSpacing: '-0.005em', paddingRight: 50 }}>
        {title}
      </div>
      {result.track.artistName && (
        <div style={{ fontSize: 13, color: C.lavender, fontWeight: 300, marginTop: 2 }}>{result.track.artistName}</div>
      )}

      {/* meta chips */}
      <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {result.track.tempo != null && <Chip variant="bpm">{result.track.tempo} BPM</Chip>}
        {result.track.tonalCharacter && <Chip>{result.track.tonalCharacter}</Chip>}
        {delta != null && delta > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(226,232,240,0.55)', letterSpacing: '0.02em', marginLeft: 'auto' }}>
            −{delta} pts
          </span>
        )}
        {isFirst && (
          <span style={{ fontSize: 11, fontWeight: 600, color: C.magenta, letterSpacing: '0.02em', marginLeft: 'auto' }}>— LEADER</span>
        )}
      </div>

      {/* score bar */}
      <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${fillPct}%`, background: `linear-gradient(90deg, ${C.purple}, ${C.magenta})`, borderRadius: 999, boxShadow: '0 0 14px rgba(124,58,237,0.4)' }} />
        </div>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 700, color: C.silver, minWidth: 56, textAlign: 'right', letterSpacing: '-0.01em', fontFamily: SANS }}>
          {score}<span style={{ color: C.lavender, fontWeight: 500, fontSize: 11, marginLeft: 2 }}>/100</span>
        </div>
      </div>

      {/* narrative */}
      <div style={{ marginTop: 8, fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, lineHeight: 1.35, color: 'rgba(226,232,240,0.78)', paddingLeft: 10, borderLeft: '2px solid rgba(167,139,250,0.35)' }}>
        {result.confidenceScore.explanation}
      </div>

      {/* tag row */}
      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ position: 'relative' }}>
          <span
            style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', padding: '4px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', background: rights.bgColor, border: `1px solid ${rights.borderColor}`, color: rights.color, cursor: rights.clickable ? 'help' : undefined }}
            onMouseEnter={() => rights.clickable && setRightsTooltip(true)}
            onMouseLeave={() => setRightsTooltip(false)}
            onClick={() => rights.clickable && setRightsTooltip(v => !v)}
          >
            {rights.clickable && (
              <span style={{ width: 13, height: 13, borderRadius: '50%', background: `${rights.color}33`, display: 'inline-grid', placeItems: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>?</span>
            )}
            {rights.label.toUpperCase()}
          </span>
          {rightsTooltip && (
            <span style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, width: 256, fontSize: 11, lineHeight: 1.5, borderRadius: 10, padding: '8px 12px', zIndex: 10, background: '#170B33', border: `1px solid ${C.hairline}`, color: C.silver }}>
              {rights.tooltip}
            </span>
          )}
        </span>
        <Chip variant="genre">{BRIEF_LABELS[briefId]}</Chip>

        {/* play button */}
        <button type="button" onClick={togglePlayback} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.silver, padding: '5px 10px', borderRadius: 999, border: `1px solid ${C.hairlineStrong}`, background: 'transparent', marginLeft: 'auto', cursor: 'pointer', fontFamily: SANS }} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying
            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden><rect x="1" y="0" width="3" height="10" /><rect x="6" y="0" width="3" height="10" /></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden><polygon points="1,0 9,5 1,10" /></svg>
          }
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.04em' }}>{timeLabel}</span>
        </button>
      </div>

      {/* rights blockers */}
      {result.rightsProfile?.blockers && result.rightsProfile.blockers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {result.rightsProfile.blockers.map(code => (
            <Chip key={code} variant="warn">{code.replace(/_/g, ' ').toLowerCase()}</Chip>
          ))}
        </div>
      )}

      {hasAudio && <audio ref={audioRef} src={audioFilePath ?? undefined} preload="metadata" className="hidden" />}
      {playbackMsg && !hasAudio && <p style={{ fontSize: 11, color: C.lavender, marginTop: 6, fontStyle: 'italic' }}>Audio playback coming soon.</p>}
    </article>
  );
}

// ── ResultsScreen ─────────────────────────────────────────────
type ResultsScreenProps = {
  briefText: string;
  briefId: BriefId;
  sceneParams: SceneParams;
  results: AnalysisResult[];
  readOnly?: boolean;
  onBack?: () => void;
};

export function ResultsScreen({ briefText, briefId, sceneParams, results, readOnly, onBack }: ResultsScreenProps) {
  const [toast, setToast] = useState<string | null>(null);

  const onExportPdf = () => {
    try { window.print(); } catch (e) { setToast(e instanceof Error ? e.message : 'Print failed.'); }
  };

  const onCopyShareLink = async () => {
    try {
      const encoded = encodeSharePayload({ briefText, briefId, sceneParams, results });
      const url = `${window.location.origin}${window.location.pathname}#share=${encoded}`;
      await navigator.clipboard.writeText(url);
      setToast('Share link copied.');
      window.setTimeout(() => setToast(null), 2400);
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't copy: ${e.message}` : "Couldn't copy link.");
    }
  };

  const topScore = results[0]?.confidenceScore.score ?? 100;

  return (
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: BG }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 20px 48px' }}>

        {/* ── sticky header ── */}
        <div style={{ position: 'sticky', top: 0, zIndex: 20, padding: '12px 0 10px', background: 'rgba(15,8,35,0.85)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SvLogo onClick={!readOnly && onBack ? onBack : undefined} />
            {!readOnly && onBack && (
              <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender }}>· Shortlist</span>
            )}
            {readOnly && (
              <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.lavender, opacity: 0.6 }}>read-only</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={onExportPdf} style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.lavender, padding: '5px 10px', borderRadius: 999, background: C.chipBg, border: `1px solid ${C.hairline}`, cursor: 'pointer', fontFamily: SANS }}>
              Export PDF
            </button>
            <button type="button" onClick={onCopyShareLink} style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.lavender, padding: '5px 10px', borderRadius: 999, background: C.chipBg, border: `1px solid ${C.hairline}`, cursor: 'pointer', fontFamily: SANS }}>
              Copy share link
            </button>
          </div>
        </div>

        {/* ── scene header ── */}
        <div style={{ paddingTop: 18, paddingBottom: 18, borderBottom: `1px solid ${C.hairline}` }}>
          <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavender, marginBottom: 4 }}>
            Shortlist · Scene
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.01em', color: C.silver, fontWeight: 400 }}>
            {BRIEF_LABELS[briefId]}
          </div>
          <div style={{ marginTop: 8, fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: 'rgba(226,232,240,0.65)', lineHeight: 1.4 }}>
            {briefText}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {sceneParams.pacing && (
              <Chip>{sceneParams.pacing.charAt(0).toUpperCase() + sceneParams.pacing.slice(1)}</Chip>
            )}
            {sceneParams.sceneLengthSec != null && <Chip>{sceneParams.sceneLengthSec}s</Chip>}
            {sceneParams.emotionalRegister && <Chip>{sceneParams.emotionalRegister}</Chip>}
          </div>
        </div>

        {/* ── tab bar (shortlist count) ── */}
        <div style={{ display: 'flex', gap: 4, padding: 4, margin: '8px 0 16px', background: 'rgba(167,139,250,0.06)', borderRadius: 12, border: `1px solid ${C.hairline}`, fontSize: 12, fontWeight: 600 }}>
          <div style={{ flex: 1, padding: '8px 0', textAlign: 'center', borderRadius: 8, background: 'rgba(124,58,237,0.22)', color: C.silver, boxShadow: 'inset 0 0 0 1px rgba(124,58,237,0.4)', letterSpacing: '0.02em' }}>
            Shortlist · {results.length}
          </div>
          <div style={{ flex: 1, padding: '8px 0', textAlign: 'center', color: C.lavender, letterSpacing: '0.02em' }}>Considered</div>
          <div style={{ flex: 1, padding: '8px 0', textAlign: 'center', color: C.lavender, letterSpacing: '0.02em' }}>Archive</div>
        </div>

        {/* ── track cards ── */}
        {results.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ color: C.silver, fontSize: 14, marginBottom: 8, fontFamily: SERIF, fontStyle: 'italic' }}>No matches found for this scene.</p>
            <p style={{ color: C.lavender, fontSize: 12, opacity: 0.7 }}>Try rewriting your scene description, or upload different tracks.</p>
          </div>
        ) : (
          results.map((r, i) => (
            <TrackCard key={r.track.id} result={r} briefId={briefId} topScore={topScore} isFirst={i === 0} />
          ))
        )}

        {/* ── print header (logo + scene label) ── */}
        <div className="print-wordmark hidden">
          <img src="/logo.png" alt="SyncVision" className="print-wordmark-logo" />
          <span className="print-wordmark-text" style={{ marginLeft: 10, opacity: 0.5, fontSize: '0.75rem', letterSpacing: '0.14em' }}>
            SYNC REPORT
          </span>
        </div>

      </div>

      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: 24, right: 24, background: '#170B33', border: `1px solid ${C.hairline}`, borderRadius: 10, padding: '8px 16px', color: C.silver, fontSize: 12 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
