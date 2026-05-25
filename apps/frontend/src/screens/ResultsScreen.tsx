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

// ── BLOCKER_LABELS ─────────────────────────────────────────────
const BLOCKER_LABELS: Record<string, string> = {
  WRITER_UNIDENTIFIED:    'Writer name missing',
  WRITER_IPI_MISSING:     'Writer IPI missing',
  PUBLISHER_UNKNOWN:      'Publisher unknown',
  PRO_WORK_ID_MISSING:    'PRO Work ID missing',
  ONE_STOP_NOT_CONFIRMED: 'One-stop not confirmed',
  MASTER_PCT_UNSET:       'Master ownership % unset',
  MASTER_OWNERSHIP_CONFLICT: 'Master ownership conflict',
  ISRC_MISSING:           'ISRC missing',
};

// ── RightsPanel ────────────────────────────────────────────────
type RightsSaveResult = {
  rightsState: string;
  blockers: string[];
  isOneStop: boolean | null;
  proAffiliation: string | null;
  masterVerifiedAt: string | null;
  masterOwnedBy: string | null;
  publisherName: string | null;
  writerName: string | null;
  syncLicenseStatus: string | null;
  syncLicensedBy: string | null;
  lyricLicenseStatus: string | null;
  lyricLicensedBy: string | null;
};

function RightsPanel({
  trackId, isrc: initialIsrc, existing, onSaved, onClose,
}: {
  trackId: string;
  isrc: string;
  existing: AnalysisResult['rightsProfile'];
  onSaved: (r: RightsSaveResult) => void;
  onClose: () => void;
}) {
  const [isrc, setIsrc]               = useState(initialIsrc.startsWith('PILOT-') ? '' : initialIsrc);
  const [writer, setWriter]           = useState(existing?.writerName ?? '');
  const [publisher, setPublisher]     = useState(existing?.publisherName ?? '');
  const [pro, setPro]                 = useState(existing?.proAffiliation ?? '');
  const [workId, setWorkId]           = useState('');
  const [oneStop, setOneStop]         = useState(existing?.isOneStop ?? false);
  const [syncLicense, setSyncLicense] = useState('');
  const [syncBy, setSyncBy]           = useState('');
  const [lyricLicense, setLyricLicense] = useState('');
  const [lyricBy, setLyricBy]         = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.hairlineStrong}`,
    borderRadius: 8, padding: '7px 10px', fontSize: 12, color: C.silver,
    fontFamily: SANS, outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase',
    color: C.lavender, display: 'block', marginBottom: 4,
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (isrc.trim())        body.isrc = isrc.trim();
      if (writer.trim())      body.writerName = writer.trim();
      if (publisher.trim())   body.publisherName = publisher.trim();
      if (pro.trim())         body.proAffiliation = pro.trim();
      if (workId.trim())      body.ascapWorkId = workId.trim();
      body.isOneStop = oneStop;
      if (syncLicense.trim()) body.syncLicenseStatus = syncLicense.trim();
      if (syncBy.trim())      body.syncLicensedBy = syncBy.trim();
      if (lyricLicense.trim()) body.lyricLicenseStatus = lyricLicense.trim();
      if (lyricBy.trim())     body.lyricLicensedBy = lyricBy.trim();

      const res = await fetch(`${API_BASE}/api/tracks/${trackId}/rights`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as RightsSaveResult;
      onSaved(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 11, background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.hairlineStrong}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, fontWeight: 700 }}>Rights intake</span>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: C.lavender, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={labelStyle}>ISRC</label>
          <input style={inputStyle} value={isrc} onChange={e => setIsrc(e.target.value)} placeholder="e.g. USRC17607839" />
        </div>
        <div>
          <label style={labelStyle}>Writer Name</label>
          <input style={inputStyle} value={writer} onChange={e => setWriter(e.target.value)} placeholder="Artist / composer" />
        </div>
        <div>
          <label style={labelStyle}>Publisher</label>
          <input style={inputStyle} value={publisher} onChange={e => setPublisher(e.target.value)} placeholder="Publisher name" />
        </div>
        <div>
          <label style={labelStyle}>PRO Affiliation</label>
          <input style={inputStyle} value={pro} onChange={e => setPro(e.target.value)} placeholder="ASCAP / BMI / SESAC" />
        </div>
        <div>
          <label style={labelStyle}>Work ID (ASCAP/BMI)</label>
          <input style={inputStyle} value={workId} onChange={e => setWorkId(e.target.value)} placeholder="Work ID" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <label style={{ ...labelStyle, marginBottom: 10 }}>One-Stop License</label>
          <button
            type="button"
            onClick={() => setOneStop(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span style={{ width: 32, height: 18, borderRadius: 999, background: oneStop ? '#34D399' : 'rgba(255,255,255,0.10)', border: `1px solid ${oneStop ? '#34D399' : C.hairlineStrong}`, position: 'relative', display: 'inline-block', flexShrink: 0, transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 2, left: oneStop ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </span>
            <span style={{ fontSize: 12, color: oneStop ? '#34D399' : C.lavender }}>{oneStop ? 'Yes' : 'No'}</span>
          </button>
        </div>
      </div>

      {/* Composition sync + lyric license */}
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: 'rgba(124,58,237,0.07)', border: `1px solid ${C.hairline}` }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.lavender, marginBottom: 8 }}>Composition &amp; Lyric Licenses</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>Sync License Status</label>
            <select style={{ ...inputStyle, appearance: 'none' }} value={syncLicense} onChange={e => setSyncLicense(e.target.value)}>
              <option value="">— not set —</option>
              <option value="CLEARED">Cleared</option>
              <option value="PENDING">Pending</option>
              <option value="NOT_CLEARED">Not cleared</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sync Licensed By</label>
            <input style={inputStyle} value={syncBy} onChange={e => setSyncBy(e.target.value)} placeholder="Publisher / agency" />
          </div>
          <div>
            <label style={labelStyle}>Lyric License Status</label>
            <select style={{ ...inputStyle, appearance: 'none' }} value={lyricLicense} onChange={e => setLyricLicense(e.target.value)}>
              <option value="">— not set —</option>
              <option value="CLEARED">Cleared</option>
              <option value="PENDING">Pending</option>
              <option value="NOT_CLEARED">Not cleared</option>
              <option value="NOT_APPLICABLE">Not applicable</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Lyric Licensed By</label>
            <input style={inputStyle} value={lyricBy} onChange={e => setLyricBy(e.target.value)} placeholder="Rights holder" />
          </div>
        </div>
      </div>
      {error && <p style={{ fontSize: 11, color: C.magenta, marginTop: 8 }}>{error}</p>}
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        style={{ marginTop: 12, width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', cursor: saving ? 'wait' : 'pointer', background: `linear-gradient(135deg, ${C.purple}, ${C.magenta})`, color: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em' }}
      >
        {saving ? 'Saving…' : 'Save Rights Data'}
      </button>
    </div>
  );
}

// ── TrackCard (inlined for full visual control) ────────────────
function TrackCard({ result, briefId, topScore, isFirst }: { result: AnalysisResult; briefId: BriefId; topScore: number; isFirst: boolean }) {
  const [isPlaying, setIsPlaying]               = useState(false);
  const [currentTime, setCurrentTime]           = useState(0);
  const [duration, setDuration]                 = useState(0);
  const [rightsTooltip, setRightsTooltip]       = useState(false);
  const [rightsPanel, setRightsPanel]           = useState(false);
  const [playbackMsg, setPlaybackMsg]           = useState(false);
  const [localRightsProfile, setLocalRightsProfile] = useState(result.rightsProfile);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioFilePath = resolveAudioUrl(result.track.audioFilePath);
  const hasAudio = audioFilePath !== null;
  const rights = rightsDisplayFor(localRightsProfile);
  const score = result.confidenceScore.score;
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
      <div style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1.1, fontWeight: 400, color: C.amber, letterSpacing: '-0.005em', paddingRight: 50 }}>
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

      {/* AI reasoning box */}
      <div className="sv-reasoning" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 11, background: 'linear-gradient(180deg, rgba(219,39,119,0.06), transparent)', border: '1px solid rgba(219,39,119,0.2)' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.magenta, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" /></svg>
          Why this track
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, lineHeight: 1.4, color: C.silver, letterSpacing: '-0.005em' }}>
          {result.confidenceScore.explanation}
        </div>
      </div>

      {/* score + breakdown axes */}
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 11, background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.hairline}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender }}>Fit · breakdown</span>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 22, lineHeight: 1, color: score >= 70 ? '#34D399' : score >= 55 ? C.amber : C.magenta, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
            {score}<span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 10, color: C.lavender, marginLeft: 2 }}>/100</span>
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 14px' }}>
          {([
            ['Scene', 'fit',     result.confidenceScore.sceneFitBreakdown],
            ['Mood',  'match',   result.confidenceScore.metaBreakdown],
            ['Audio', 'quality', result.confidenceScore.audioBreakdown],
            ['Rights','score',   result.confidenceScore.rightsBreakdown],
          ] as [string, string, number][]).map(([label, sub, pct]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.lavender }}>
                <span>{label} <span style={{ color: C.silver, fontWeight: 600 }}>{sub}</span></span>
                <span style={{ color: C.silver, fontFamily: 'monospace' }}>{Math.round(pct)}%</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: 'linear-gradient(90deg, #F5B544, #F97316)', borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* tag row */}
      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ position: 'relative' }}>
          <span
            style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', padding: '4px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', background: rights.bgColor, border: `1px solid ${rights.borderColor}`, color: rights.color, cursor: 'pointer' }}
            onMouseEnter={() => !rightsPanel && setRightsTooltip(true)}
            onMouseLeave={() => setRightsTooltip(false)}
            onClick={() => { setRightsTooltip(false); setRightsPanel(v => !v); }}
          >
            <span style={{ width: 13, height: 13, borderRadius: '50%', background: `${rights.color}33`, display: 'inline-grid', placeItems: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>✎</span>
            {rights.label.toUpperCase()}
          </span>
          {rightsTooltip && !rightsPanel && (
            <span style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, width: 256, fontSize: 11, lineHeight: 1.5, borderRadius: 10, padding: '8px 12px', zIndex: 10, background: '#170B33', border: `1px solid ${C.hairline}`, color: C.silver }}>
              {rights.tooltip} — Click to enter rights data.
            </span>
          )}
        </span>
        <Chip variant="genre">{BRIEF_LABELS[briefId]}</Chip>
      </div>

      {/* rights intake panel */}
      {rightsPanel && (
        <RightsPanel
          trackId={result.track.id}
          isrc={result.track.isrc}
          existing={localRightsProfile}
          onSaved={(saved) => {
            setLocalRightsProfile({
              isOneStop: saved.isOneStop,
              proAffiliation: saved.proAffiliation,
              masterVerifiedAt: saved.masterVerifiedAt,
              masterOwnedBy: saved.masterOwnedBy,
              publisherName: saved.publisherName,
              writerName: saved.writerName,
              blockers: saved.blockers,
              rightsState: saved.rightsState,
            });
            setRightsPanel(false);
          }}
          onClose={() => setRightsPanel(false)}
        />
      )}

      {/* rights blockers */}
      {!rightsPanel && localRightsProfile?.blockers && localRightsProfile.blockers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {localRightsProfile.blockers.map(code => (
            <Chip key={code} variant="warn">{BLOCKER_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase()}</Chip>
          ))}
        </div>
      )}

      {/* waveform player */}
      <div className="no-print" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 8px', borderRadius: 11, background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.hairline}` }}>
        <button type="button" onClick={togglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'} style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: isFirst ? `linear-gradient(135deg, ${C.purple}, ${C.magenta})` : C.silver, color: isFirst ? '#fff' : '#0F0823', border: 'none', cursor: 'pointer', boxShadow: isFirst ? '0 6px 14px -6px rgba(219,39,119,0.5)' : undefined }}>
          {isPlaying
            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden><rect x="1.5" y="1" width="2.5" height="8" /><rect x="6" y="1" width="2.5" height="8" /></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden><path d="M2 1 L8 5 L2 9 Z" /></svg>
          }
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, height: 26, overflow: 'hidden' }}>
          {[30,55,40,72,50,90,60,35,65,48,78,42,62,38,55,80,45,60,30,70,42,55,36,50,65,40,58,32,48,55,38,60,42,50,30,45,38,52,34,48].map((h, i) => {
            const played = duration > 0 && (i / 40) < (currentTime / duration);
            return <span key={i} style={{ display: 'block', width: 2, flexShrink: 0, height: `${h}%`, borderRadius: 2, background: played ? `linear-gradient(180deg, ${C.purple}, ${C.magenta})` : 'rgba(167,139,250,0.3)' }} />;
          })}
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: C.lavender, letterSpacing: '0.05em', flexShrink: 0 }}>{timeLabel}</span>
      </div>


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
