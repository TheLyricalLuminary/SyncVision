import { useEffect, useRef, useState } from 'react';
import { API_BASE, type AnalysisResult, type SceneArc } from '../utils/apiClient';
import { ArcMatchGraph } from './ArcMatchGraph';
import { RightsTable, RightsPanel, type LocalRightsOverride, type AutoFill, type RightsSaveResult } from './RightsBlock';

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

function buildScoreCaption(vec: { scene: number; lyrics: number; audioSignal: number; rightsClarity: number }): string {
  const scenePart = vec.scene >= 0.7 ? 'Scene fit is strong' : vec.scene >= 0.5 ? 'Scene fit is decent' : 'Scene fit is weak';
  const rest: string[] = [];
  if (vec.rightsClarity < 0.35)       rest.push('Rights are dragging.');
  else if (vec.rightsClarity >= 0.65) rest.push('Rights look solid.');
  if (vec.lyrics === 0)               rest.push("Lyrics aren't scored yet.");
  else if (vec.lyrics < 0.4)          rest.push('Lyrics are below target.');
  if (vec.audioSignal >= 0.6)         rest.push('Signal is decent.');
  else if (vec.audioSignal < 0.35)    rest.push('Signal is thin.');
  return `${scenePart} — that's most of the score.${rest.length ? ' ' + rest.join(' ') : ''}`;
}

type Props = {
  result: AnalysisResult;
  sceneArc?: SceneArc | null;
  onShare?: () => void;
  onRightsSaved?: (trackId: string, override: LocalRightsOverride) => void;
  onMoveToConsidered?: (trackId: string) => void;
};

export function DecisionRail({ result, sceneArc, onShare, onRightsSaved, onMoveToConsidered }: Props) {
  const hasArcData = Boolean(
    result.confidenceScore.arcMatch &&
    result.confidenceScore.songArcCurve &&
    result.confidenceScore.songArcValenceCurve,
  );

  const [isPlaying,       setIsPlaying]       = useState(false);
  const [currentTime,     setCurrentTime]     = useState(0);
  const [duration,        setDuration]        = useState(0);
  const [rightsPanel,     setRightsPanel]     = useState(false);
  const [playbackMsg,     setPlaybackMsg]     = useState(false);
  const [noteOpen,        setNoteOpen]        = useState(false);
  const [noteText,        setNoteText]        = useState('');
  const [localRights,     setLocalRights]     = useState(result.rightsProfile);
  const [pendingAutoFill, setPendingAutoFill] = useState<AutoFill | undefined>(undefined);
  const [evidenceOpen,    setEvidenceOpen]    = useState(!hasArcData);
  const [audioError,      setAudioError]      = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioFilePath = resolveAudioUrl(result.track.audioFilePath);
  const hasAudio      = audioFilePath !== null;
  const title         = cleanTitle(result.track.title);
  const timeLabel     = duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : formatTime(currentTime);

  const vec     = result.confidenceScore.vector;
  const WEIGHTS = { scene: 0.45, lyrics: 0.25, audioSignal: 0.20, rightsClarity: 0.10 };
  const liveScore = Math.round(
    (vec.scene * WEIGHTS.scene + vec.lyrics * WEIGHTS.lyrics +
     vec.audioSignal * WEIGHTS.audioSignal + vec.rightsClarity * WEIGHTS.rightsClarity) * 100,
  );

  const MAX_W = 0.45;
  const AXES = [
    { key: 'scene',         label: 'Scene',  weight: 0.45, value: vec.scene,         fixed: true  },
    { key: 'lyrics',        label: 'Lyrics', weight: 0.25, value: vec.lyrics,        fixed: false },
    { key: 'audioSignal',   label: 'Signal', weight: 0.20, value: vec.audioSignal,   fixed: true  },
    { key: 'rightsClarity', label: 'Rights', weight: 0.10, value: vec.rightsClarity, fixed: false },
  ];

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioError(null);
    setRightsPanel(false);
    setLocalRights(result.rightsProfile);
    setEvidenceOpen(!hasArcData);
  }, [result.track.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime  = () => setCurrentTime(audio.currentTime);
    const onMeta  = () => setDuration(audio.duration);
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onError = () => {
      const err = audio.error;
      const msg = err ? `Audio error ${err.code}: ${err.message || 'file may be missing or unsupported'}` : 'Audio failed to load';
      setAudioError(msg);
      setIsPlaying(false);
    };
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

  const arcMatch = result.confidenceScore.arcMatch;
  const matchColor = arcMatch
    ? arcMatch.combinedScore >= 75 ? C.good : arcMatch.combinedScore >= 50 ? C.amber : C.lavender
    : C.lavender;

  return (
    <article style={{
      borderRadius: 20,
      padding: 22,
      background: 'linear-gradient(180deg,rgba(26,22,48,0.60),rgba(16,12,32,0.78))',
      border: `1px solid ${C.hairline}`,
    }}>

      {/* ── track head ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: C.magenta }}>#{result.rank}</span>
          {(localRights?.blockers?.length ?? 0) > 0 && (
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'rgba(245,181,68,0.12)', border: '1px solid rgba(245,181,68,0.28)', color: C.amber }}>Rights unclear</span>
          )}
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

      {/* ── arc match hero ── */}
      {arcMatch && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
          <div style={{ fontFamily: SERIF, fontSize: 'clamp(52px,7vw,72px)', lineHeight: 0.85, letterSpacing: '-0.04em', color: matchColor }}>
            {arcMatch.combinedScore}
            <span style={{ fontSize: '0.28em', color: 'rgba(167,139,250,0.5)', letterSpacing: '-0.01em', marginLeft: 4, verticalAlign: '0.6em' }}>/100</span>
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender }}>Arc Match</div>
            <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 10, color: 'rgba(155,147,196,0.6)', marginTop: 3 }}>
              shape {arcMatch.magnitudeScore} · val {arcMatch.valenceScore}
            </div>
          </div>
        </div>
      )}

      {/* ── Story Match graph ── */}
      {hasArcData && sceneArc ? (
        <ArcMatchGraph
          sceneArc={sceneArc}
          songArcCurve={result.confidenceScore.songArcCurve!}
          songArcValenceCurve={result.confidenceScore.songArcValenceCurve!}
          arcMatch={arcMatch!}
        />
      ) : (
        <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, color: 'rgba(155,147,196,0.4)', margin: '12px 0' }}>
          {sceneArc ? 'No timeline data for this track.' : 'Extract a scene arc to see the Story Match overlay.'}
        </p>
      )}

      {/* ── supporting evidence (collapsible) ── */}
      <div style={{ marginTop: 16, borderRadius: 12, border: `1px solid ${C.hairline}`, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setEvidenceOpen(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(7,4,26,0.45)', border: 'none', cursor: 'pointer', color: C.lavender }}
        >
          <span style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700 }}>Supporting evidence</span>
          <span style={{ fontSize: 13, transition: 'transform 0.2s', display: 'inline-block', transform: evidenceOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
        </button>

        {evidenceOpen && (
          <div style={{ padding: '14px 14px 10px', background: 'rgba(7,4,26,0.35)' }}>
            {/* fit index score */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
              <div style={{ fontFamily: SERIF, fontSize: 38, lineHeight: 0.9, letterSpacing: '-0.03em', color: C.silver }}>
                {liveScore}
                <span style={{ fontSize: '0.32em', color: 'rgba(167,139,250,0.4)', marginLeft: 3, verticalAlign: '0.55em' }}>/100</span>
              </div>
              <p style={{ flex: 1, margin: 0, fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, lineHeight: 1.35, color: 'rgba(226,232,240,0.65)' }}>
                {buildScoreCaption(vec)}
              </p>
            </div>

            {/* axis bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {AXES.map(axis => {
                const barW    = (axis.weight / MAX_W) * 100;
                const fillPct = Math.round(axis.value * 100);
                const unscored = axis.value === 0 && !axis.fixed;
                return (
                  <div key={axis.key} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) 32px 22px', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.silver }}>
                      {axis.label}
                      <span style={{ display: 'block', fontFamily: '"JetBrains Mono",monospace', fontSize: 8, fontWeight: 500, color: 'rgba(167,139,250,0.5)', marginTop: 1 }}>
                        {Math.round(axis.weight * 100)}% wt
                      </span>
                    </div>
                    <div style={{ position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
                      <div style={{ height: 11, borderRadius: 6, background: 'linear-gradient(90deg,rgba(167,139,250,0.05),rgba(167,139,250,0.10))', border: `1px solid ${C.hairline}`, position: 'relative', overflow: 'hidden', width: `${barW}%` }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: unscored ? '0%' : `${fillPct}%`, background: axis.fixed ? 'linear-gradient(90deg,rgba(219,39,119,0.55),rgba(219,39,119,0.85))' : 'linear-gradient(90deg,#C2410C,#F5A623)', borderRadius: 5 }} />
                        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, background: C.hairlineStrong }} />
                      </div>
                    </div>
                    <div style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, fontWeight: 600, color: unscored ? 'rgba(167,139,250,0.4)' : C.silver, textAlign: 'right' }}>
                      {unscored ? '—' : fillPct}
                    </div>
                    {!axis.fixed ? (
                      <button type="button" onClick={() => setRightsPanel(true)} style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: '"JetBrains Mono",monospace', fontSize: 11, fontWeight: 700, color: C.magenta, background: 'rgba(221,122,58,0.10)', border: '1px solid rgba(221,122,58,0.35)', cursor: 'pointer', flexShrink: 0 }} title="Improve this axis">↑</button>
                    ) : (
                      <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'rgba(167,139,250,0.3)', border: `1px dashed rgba(167,139,250,0.2)`, fontFamily: '"JetBrains Mono",monospace', fontSize: 11, flexShrink: 0 }}>—</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── narrative ── */}
      <div style={{ marginTop: 16, padding: '13px 15px', borderRadius: 12, background: 'rgba(167,139,250,0.05)', borderLeft: `2px solid ${C.magenta}`, fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(13px,1.3vw,15px)', lineHeight: 1.45, color: C.silver }}>
        {result.confidenceScore.explanation}
      </div>

      {/* ── rights block ── */}
      {!rightsPanel ? (
        <RightsTable rp={localRights} trackId={result.track.id} onEditRights={() => setRightsPanel(true)} />
      ) : (
        <RightsPanel
          trackId={result.track.id}
          isrc={localRights?.isrc ?? result.track.isrc}
          existing={localRights}
          autoFill={pendingAutoFill}
          onSaved={(saved: RightsSaveResult) => {
            const newRp: LocalRightsOverride = {
              isrc: saved.isrc, isOneStop: saved.isOneStop, proAffiliation: saved.proAffiliation,
              masterVerifiedAt: saved.masterVerifiedAt, masterOwnedBy: saved.masterOwnedBy,
              publisherName: saved.publisherName, writerName: saved.writerName,
              workId: saved.workId, blockers: saved.blockers, rightsState: saved.rightsState,
              syncLicenseStatus: saved.syncLicenseStatus, syncLicensedBy: saved.syncLicensedBy,
              lyricLicenseStatus: saved.lyricLicenseStatus, lyricLicensedBy: saved.lyricLicensedBy,
              splitPct: saved.splitPct,
            };
            setLocalRights(newRp);
            onRightsSaved?.(result.track.id, newRp);
            setRightsPanel(false);
          }}
          onClose={() => { setRightsPanel(false); setPendingAutoFill(undefined); }}
        />
      )}

      {/* ── player ── */}
      <div className="no-print" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 12, background: 'rgba(0,0,0,0.32)', border: `1px solid ${C.hairline}` }}>
        <button type="button" onClick={togglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'} style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg,${C.purple},${C.magenta})`, border: 0, color: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: `0 8px 18px -8px rgba(245,166,35,0.55)${isPlaying ? ', 0 0 0 3px rgba(245,166,35,0.22)' : ''}`, flexShrink: 0, transition: 'box-shadow 0.2s' }}>
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
        <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 10, color: C.lavender, letterSpacing: '0.04em', flexShrink: 0 }}>{timeLabel}</span>
      </div>
      {playbackMsg && !hasAudio && <p style={{ fontSize: 11, color: C.lavender, marginTop: 5, fontStyle: 'italic' }}>Audio playback coming soon.</p>}
      {audioError && <p style={{ fontSize: 11, color: '#E85A5A', marginTop: 5, fontFamily: '"JetBrains Mono",monospace' }}>{audioError}</p>}

      {/* ── actions ── */}
      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={onShare} style={{ flex: 1, minWidth: 110, padding: '10px 14px', borderRadius: 10, border: 0, background: `linear-gradient(135deg,${C.purple},${C.magenta})`, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxShadow: '0 12px 26px -12px rgba(221,122,58,0.5)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 12 L10 18 L20 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Pitch to director
        </button>
        <button type="button" onClick={() => onMoveToConsidered?.(result.track.id)} style={{ flex: 1, minWidth: 110, padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.hairlineStrong}`, background: 'rgba(167,139,250,0.06)', color: C.silver, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          Considered
        </button>
        <button type="button" onClick={() => setNoteOpen(v => !v)} style={{ flex: 1, minWidth: 80, padding: '10px 14px', borderRadius: 10, border: `1px solid ${noteOpen ? 'rgba(219,39,119,0.3)' : C.hairlineStrong}`, background: noteOpen ? 'rgba(219,39,119,0.08)' : 'rgba(167,139,250,0.06)', color: C.silver, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          Notes
        </button>
      </div>

      {noteOpen && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 10, background: noteText ? 'linear-gradient(180deg,rgba(219,39,119,0.08),transparent)' : 'rgba(0,0,0,0.28)', border: `1px solid ${noteText ? 'rgba(219,39,119,0.3)' : C.hairline}` }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: C.magenta, flexShrink: 0 }}><path d="M4 5 H20 V17 H10 L6 21 V17 H4 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
          <input type="text" placeholder="Add a note for the director…" value={noteText} onChange={e => setNoteText(e.target.value)} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: C.silver, fontFamily: SANS, fontSize: 12 }} />
        </div>
      )}

      {hasAudio && <audio ref={audioRef} src={audioFilePath!} preload="metadata" />}
    </article>
  );
}
