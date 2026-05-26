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

function cleanTrackTitle(raw: string): string {
  let t = raw;
  // strip leading UUID-style prefix (e.g. "a1b2c3d4_")
  t = t.replace(/^[0-9a-f]{6,}_/i, '');
  // replace underscores with spaces
  t = t.replace(/_/g, ' ');
  // strip common file-noise suffixes
  t = t.replace(/\.(mp3|wav|flac|aiff?)$/i, '');
  t = t.replace(/\b(Official\s+Video|Official\s+Audio|Lyric\s+Video|HD|HQ|4K|Audio|Video|background\s+vocals?\s*\d*)\b/gi, '');
  // strip trailing numbers/noise left by watermarking tools
  t = t.replace(/\s+\d{1,3}\s*$/, '');
  // collapse multiple spaces
  t = t.replace(/\s{2,}/g, ' ').trim();
  // strip "Artist - " prefix
  if (t.includes(' - ')) t = t.slice(t.indexOf(' - ') + 3).trim();
  return t || raw;
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

// ── RightsPipelineView ─────────────────────────────────────────
interface AutoFill {
  isrc: string | null;
  iswc: string | null;
  writerName: string | null;
  writerIpi: string | null;
  publisherName: string | null;
  proAffiliation: string | null;
  sources: {
    isrc: string | null;
    writer: string | null;
    publisher: string | null;
    pro: string | null;
  };
  lyricsLinkage: {
    hasLyrics: boolean;
    explicit: boolean;
    url: string | null;
    isrc: string | null;
    source: string;
  } | null;
}

interface FingerprintResult {
  acoustidId: string | null;
  score: number;
  matchQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_MATCH';
  topRecording: { id: string; title: string | null; artist: string | null } | null;
  discrepancies: { field: string; submitted: string | null; external: string | null }[];
  reconciliationNote: string;
  autoFill: AutoFill;
}

function RightsPipelineView({
  rp, trackId, onOpenIntake,
}: {
  rp: AnalysisResult['rightsProfile'];
  trackId: string;
  onOpenIntake: (autoFill?: AutoFill) => void;
}) {
  const [fingerprinting, setFingerprinting] = useState(false);
  const [fpResult, setFpResult]             = useState<FingerprintResult | null>(null);
  const [fpError, setFpError]               = useState<string | null>(null);

  const hasWriter    = Boolean(rp?.writerName);
  const hasPublisher = Boolean(rp?.publisherName);
  const hasPro       = Boolean(rp?.proAffiliation || rp?.writerName);
  const hasOneStop   = rp?.isOneStop === true;
  const syncCleared  = (rp as Record<string, unknown> | null)?.syncLicenseStatus === 'CLEARED';
  const lyricCleared = (rp as Record<string, unknown> | null)?.lyricLicenseStatus === 'CLEARED';
  const hasAnyIntake = hasWriter || hasPublisher || hasPro;

  const matchQ = fpResult?.matchQuality;

  const stages: { label: string; done: boolean; warn?: boolean }[] = [
    { label: 'Metadata intake',          done: hasAnyIntake },
    { label: 'Writer / splits captured', done: hasWriter },
    { label: 'Publisher data captured',  done: hasPublisher },
    { label: 'One-stop confirmed',        done: hasOneStop },
    { label: 'Sync license cleared',     done: syncCleared },
    { label: 'Lyric license cleared',    done: lyricCleared },
    {
      label: fpResult
        ? matchQ === 'HIGH'   ? 'Identity verified (AcoustID ✓)'
        : matchQ === 'MEDIUM' ? 'Identity probable — review recommended'
        : matchQ === 'LOW'    ? 'Low-confidence match — manual review'
        :                       'No external match found'
        : 'Fingerprint identity resolution',
      done: matchQ === 'HIGH' || matchQ === 'MEDIUM',
      warn: matchQ === 'LOW' || matchQ === 'NO_MATCH',
    },
    { label: 'PRO cross-check',          done: false },
  ];

  const completedCount = stages.filter(s => s.done).length;
  const confidencePct  = Math.round((completedCount / stages.length) * 100);

  const runFingerprint = async () => {
    setFingerprinting(true);
    setFpError(null);
    try {
      const res = await fetch(`${API_BASE}/api/tracks/${trackId}/fingerprint`, { method: 'POST' });
      const data = await res.json() as FingerprintResult & { error?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? data.error ?? `Server ${res.status}`);
      setFpResult(data);
      // If the lookup resolved any rights fields, open the intake form pre-populated
      const af = data.autoFill;
      if (af && (af.writerName || af.publisherName || af.isrc)) {
        onOpenIntake(af);
      }
    } catch (e) {
      setFpError(e instanceof Error ? e.message : 'Fingerprint failed');
    } finally {
      setFingerprinting(false);
    }
  };

  return (
    <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 11, background: 'rgba(0,0,0,0.22)', border: `1px solid ${C.hairline}` }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, fontWeight: 700 }}>Rights intake &amp; verification</div>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.lavender, marginTop: 3, opacity: 0.7 }}>pipeline</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 20, lineHeight: 1, color: confidencePct >= 70 ? '#34D399' : confidencePct >= 40 ? C.amber : C.magenta }}>
            {confidencePct}%
          </div>
          <div style={{ fontSize: 9, color: C.lavender, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>Rights confidence</div>
        </div>
      </div>

      {/* stages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {stages.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800,
              background: s.done ? 'rgba(52,211,153,0.18)' : s.warn ? 'rgba(219,39,119,0.15)' : 'rgba(167,139,250,0.10)',
              color: s.done ? '#34D399' : s.warn ? C.magenta : 'rgba(167,139,250,0.5)',
              border: `1px solid ${s.done ? 'rgba(52,211,153,0.4)' : s.warn ? 'rgba(219,39,119,0.3)' : C.hairline}`,
            }}>
              {s.done ? '✓' : s.warn ? '!' : '⧗'}
            </span>
            <span style={{ fontSize: 11, color: s.done ? C.silver : s.warn ? C.magenta : 'rgba(226,232,240,0.45)', letterSpacing: '0.01em' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* fingerprint result detail */}
      {fpResult && fpResult.discrepancies.length > 0 && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(219,39,119,0.08)', border: '1px solid rgba(219,39,119,0.2)' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.magenta, fontWeight: 700, marginBottom: 6 }}>Discrepancy detected</div>
          {fpResult.discrepancies.map(d => (
            <div key={d.field} style={{ fontSize: 11, color: C.silver, marginBottom: 4 }}>
              <span style={{ color: C.lavender, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.12em' }}>{d.field}: </span>
              <span style={{ color: C.amber }}>"{d.submitted}"</span>
              <span style={{ color: 'rgba(226,232,240,0.45)', margin: '0 6px' }}>→</span>
              <span style={{ color: C.magenta }}>external: "{d.external}"</span>
            </div>
          ))}
          <div style={{ fontSize: 10, color: 'rgba(226,232,240,0.55)', marginTop: 4, fontStyle: 'italic' }}>Review recommended before placement</div>
        </div>
      )}
      {fpResult && fpResult.discrepancies.length === 0 && fpResult.matchQuality !== 'NO_MATCH' && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#34D399', fontStyle: 'italic' }}>{fpResult.reconciliationNote}</div>
      )}

      {/* autoFill resolved fields summary */}
      {fpResult?.autoFill && (fpResult.autoFill.writerName || fpResult.autoFill.publisherName || fpResult.autoFill.isrc) && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#34D399', fontWeight: 700, marginBottom: 6 }}>
            Fields resolved — opening intake form
          </div>
          {fpResult.autoFill.writerName && (
            <div style={{ fontSize: 11, color: C.silver, marginBottom: 2 }}>
              <span style={{ color: C.lavender, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Writer: </span>
              {fpResult.autoFill.writerName}
              <span style={{ color: 'rgba(167,139,250,0.5)', fontSize: 9, marginLeft: 6 }}>via {fpResult.autoFill.sources.writer}</span>
            </div>
          )}
          {fpResult.autoFill.publisherName && (
            <div style={{ fontSize: 11, color: C.silver, marginBottom: 2 }}>
              <span style={{ color: C.lavender, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Publisher: </span>
              {fpResult.autoFill.publisherName}
              <span style={{ color: 'rgba(167,139,250,0.5)', fontSize: 9, marginLeft: 6 }}>via {fpResult.autoFill.sources.publisher}</span>
            </div>
          )}
          {fpResult.autoFill.isrc && (
            <div style={{ fontSize: 11, color: C.silver, marginBottom: 2 }}>
              <span style={{ color: C.lavender, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>ISRC: </span>
              {fpResult.autoFill.isrc}
            </div>
          )}
          {fpResult.autoFill.proAffiliation && (
            <div style={{ fontSize: 11, color: C.silver }}>
              <span style={{ color: C.lavender, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>PRO: </span>
              {fpResult.autoFill.proAffiliation}
            </div>
          )}
          {fpResult.autoFill.lyricsLinkage && (
            <div style={{ fontSize: 11, color: C.silver, marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ color: C.lavender, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Lyrics: </span>
              {fpResult.autoFill.lyricsLinkage.hasLyrics ? (
                <>
                  {fpResult.autoFill.lyricsLinkage.explicit && (
                    <span style={{ background: C.amberSoft, color: C.amber, fontSize: 9, padding: '1px 5px', borderRadius: 4, marginRight: 5, fontWeight: 700 }}>EXPLICIT</span>
                  )}
                  {fpResult.autoFill.lyricsLinkage.url
                    ? <a href={fpResult.autoFill.lyricsLinkage.url} target="_blank" rel="noreferrer" style={{ color: '#34D399', textDecoration: 'none' }}>available via musixmatch ↗</a>
                    : <span style={{ color: '#34D399' }}>available</span>
                  }
                </>
              ) : (
                <span style={{ color: 'rgba(226,232,240,0.4)' }}>not found in registry</span>
              )}
            </div>
          )}
        </div>
      )}

      {fpError && <div style={{ marginTop: 8, fontSize: 10, color: C.magenta }}>{fpError}</div>}

      {/* actions */}
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => onOpenIntake()} style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: `1px solid ${C.hairlineStrong}`, background: 'transparent', color: C.lavender, fontFamily: SANS, fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
          ✎ Edit Rights Data
        </button>
        <button type="button" onClick={() => void runFingerprint()} disabled={fingerprinting} style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', background: `linear-gradient(135deg, ${C.purple}, ${C.magenta})`, color: '#fff', fontFamily: SANS, fontSize: 11, fontWeight: 700, cursor: fingerprinting ? 'wait' : 'pointer', letterSpacing: '0.04em' }}>
          {fingerprinting ? 'Resolving…' : '⦿ Resolve Identity'}
        </button>
      </div>
    </div>
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
  trackId, isrc: initialIsrc, existing, autoFill, onSaved, onClose,
}: {
  trackId: string;
  isrc: string | null;
  existing: AnalysisResult['rightsProfile'];
  autoFill?: AutoFill;
  onSaved: (r: RightsSaveResult) => void;
  onClose: () => void;
}) {
  const [isrc, setIsrc]               = useState(autoFill?.isrc ?? ((!initialIsrc || initialIsrc.startsWith('PILOT-')) ? '' : initialIsrc) ?? '');
  const [writer, setWriter]           = useState(autoFill?.writerName ?? existing?.writerName ?? '');
  const [publisher, setPublisher]     = useState(autoFill?.publisherName ?? existing?.publisherName ?? '');
  const [pro, setPro]                 = useState(autoFill?.proAffiliation ?? existing?.proAffiliation ?? '');
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
        <div>
          <span style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender, fontWeight: 700 }}>Rights intake</span>
          {autoFill && (autoFill.writerName || autoFill.publisherName || autoFill.isrc) && (
            <span style={{ marginLeft: 8, fontSize: 9, color: '#34D399', fontWeight: 600, letterSpacing: '0.1em' }}>
              ✓ auto-filled from {autoFill.sources.writer ?? autoFill.sources.publisher ?? 'registry'}
            </span>
          )}
        </div>
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
  const [showPipeline, setShowPipeline]         = useState(false);
  const [playbackMsg, setPlaybackMsg]           = useState(false);
  const [localRightsProfile, setLocalRightsProfile] = useState(result.rightsProfile);
  const [localVector, setLocalVector]               = useState(result.confidenceScore.vector ?? { scene: result.confidenceScore.sceneFitBreakdown / 100, rights: result.confidenceScore.rightsBreakdown / 100, lyrics: result.confidenceScore.lyricsBreakdown / 100, signal: result.confidenceScore.signalBreakdown / 100 });
  const [pendingAutoFill, setPendingAutoFill]        = useState<AutoFill | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Mirror of backend scoreTrack() — same WEIGHTS, same dot product.
  // Recomputed locally whenever rights data saves so the card updates immediately.
  const WEIGHTS = { scene: 0.45, rights: 0.25, lyrics: 0.25, signal: 0.05 };
  const liveScore = Math.round(
    (localVector.scene  * WEIGHTS.scene  +
     localVector.rights * WEIGHTS.rights +
     localVector.lyrics * WEIGHTS.lyrics +
     localVector.signal * WEIGHTS.signal) * 100
  );

  // Recomputes rights axis from blocker list — mirrors buildRightsAxis() in trackVector.ts.
  const rightsAxisFromBlockers = (blockers: string[], hasIsrc: boolean): number => {
    const BLOCKER_COSTS: Record<string, number> = {
      MASTER_PCT_UNSET: 20, WRITER_UNIDENTIFIED: 15, WRITER_IPI_MISSING: 15,
      PUBLISHER_UNKNOWN: 15, PRO_WORK_ID_MISSING: 15, ONE_STOP_NOT_CONFIRMED: 20,
    };
    let clearanceScore = 100;
    for (const b of blockers) clearanceScore -= (BLOCKER_COSTS[b] ?? 0);
    clearanceScore = Math.max(0, clearanceScore);
    const clearanceRisk       = 1 - clearanceScore / 100;
    const metadataUncertainty = hasIsrc ? 0 : 0.08;
    return Math.max(0, Math.min(1, 1 - clearanceRisk - metadataUncertainty - 0.04));
  };

  const audioFilePath = resolveAudioUrl(result.track.audioFilePath);
  const hasAudio = audioFilePath !== null;
  const rights = rightsDisplayFor(localRightsProfile);
  const score = liveScore;
  const delta = isFirst ? null : topScore - score;
  const title = cleanTrackTitle(result.track.title);
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
            −{delta} pts separation
          </span>
        )}
        {isFirst && (
          <span style={{ fontSize: 11, fontWeight: 600, color: C.magenta, letterSpacing: '0.02em', marginLeft: 'auto' }}>Best fit in shortlist</span>
        )}
      </div>

      {/* Sync assessment box */}
      <div className="sv-reasoning" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 11, background: 'linear-gradient(180deg, rgba(219,39,119,0.06), transparent)', border: '1px solid rgba(219,39,119,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.magenta, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" /></svg>
            Sync assessment
          </div>
          <span style={{ fontSize: 8, color: 'rgba(219,39,119,0.45)', letterSpacing: '0.08em' }}>deterministic · audit-stable</span>
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, lineHeight: 1.6, color: '#F1F5F9', letterSpacing: '0.005em' }}>
          {result.confidenceScore.explanation}
        </div>
      </div>

      {/* score + weighted breakdown */}
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 11, background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.hairline}` }}>

        {/* scalar score */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span style={{ fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase', color: C.lavender }}>Fit Index</span>
          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 22, lineHeight: 1, color: score >= 70 ? '#34D399' : score >= 55 ? C.amber : C.magenta, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', transition: 'color 0.3s' }}>
            {score}<span style={{ fontFamily: SANS, fontStyle: 'normal', fontSize: 10, color: C.lavender, marginLeft: 2 }}>/100</span>
          </span>
        </div>

        {/* weighted axis bars — container width ∝ weight, fill ∝ axis value */}
        <div style={{ display: 'flex', gap: 2, width: '100%' }}>
          {([
            { key: 'scene',  label: 'Scene',  sub: 'fit',     weight: 0.45, value: localVector.scene,  actionable: false },
            { key: 'rights', label: 'Rights', sub: 'exposure', weight: 0.25, value: localVector.rights, actionable: true  },
            { key: 'lyrics', label: 'Lyrics', sub: 'fit',     weight: 0.25, value: localVector.lyrics, actionable: false, pending: !localRightsProfile },
            { key: 'signal', label: 'Signal', sub: 'quality', weight: 0.05, value: localVector.signal, actionable: false },
          ] as { key: string; label: string; sub: string; weight: number; value: number; actionable: boolean; pending?: boolean }[]).map((axis, _i, arr) => {
            const pct   = Math.round(axis.value * 100);
            const isLow = axis.value < 0.4;
            const barColor = axis.value >= 0.7 ? 'linear-gradient(90deg,#34D399,#22c55e)' : axis.value >= 0.45 ? 'linear-gradient(90deg,#F5B544,#F97316)' : 'linear-gradient(90deg,#DB2777,#be185d)';
            // gap is 2px × (n-1) total; subtract proportional share
            const gapDeduction = `${2 * (arr.length - 1) * axis.weight}px`;
            return (
              <div
                key={axis.key}
                style={{ display: 'flex', flexDirection: 'column', gap: 4, width: `calc(${axis.weight * 100}% - ${gapDeduction})`, flexShrink: 0 }}
              >
                {/* label row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender }}>
                  <span style={{ fontWeight: 700, color: C.silver }}>{axis.label}</span>
                  {axis.actionable ? (
                    <button
                      type="button"
                      onClick={() => { setShowPipeline(false); setRightsPanel(true); }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 10, color: isLow ? C.magenta : C.lavender, fontWeight: 700, lineHeight: 1 }}
                      title="Enter rights data"
                    >↑</button>
                  ) : axis.pending ? (
                    <span style={{ fontSize: 9, color: 'rgba(167,139,250,0.4)' }}>–</span>
                  ) : null}
                </div>

                {/* bar track */}
                <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: axis.pending ? 'rgba(167,139,250,0.15)' : barColor,
                    borderRadius: 999,
                    transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                  }} />
                </div>

                {/* value */}
                <div style={{ fontSize: 9, fontFamily: 'monospace', color: axis.pending ? 'rgba(167,139,250,0.4)' : C.lavender, letterSpacing: '0.04em' }}>
                  {axis.pending ? '—' : `${pct}`}
                  {/* weight label only on wider axes */}
                  {axis.weight >= 0.2 && <span style={{ opacity: 0.45, marginLeft: 2 }}>{axis.sub}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* weight legend — shown once, bottom right */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <span style={{ fontSize: 8, color: 'rgba(167,139,250,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            bar width = weight · bar fill = axis value
          </span>
        </div>

        {/* epistemic line */}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.hairline}`, fontSize: 9, color: 'rgba(167,139,250,0.45)', letterSpacing: '0.06em', lineHeight: 1.5 }}>
          Surfaces what you need to decide, faster — does not decide for you.
        </div>
      </div>

      {/* tag row */}
      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ position: 'relative' }}>
          <span
            style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', padding: '4px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', background: rights.bgColor, border: `1px solid ${rights.borderColor}`, color: rights.color, cursor: 'pointer' }}
            onMouseEnter={() => !showPipeline && setRightsTooltip(true)}
            onMouseLeave={() => setRightsTooltip(false)}
            onClick={() => { setRightsTooltip(false); setShowPipeline(v => !v); setRightsPanel(false); }}
          >
            <span style={{ width: 13, height: 13, borderRadius: '50%', background: `${rights.color}33`, display: 'inline-grid', placeItems: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>⧖</span>
            {rights.label.toUpperCase()}
          </span>
          {rightsTooltip && !showPipeline && (
            <span style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, width: 256, fontSize: 11, lineHeight: 1.5, borderRadius: 10, padding: '8px 12px', zIndex: 10, background: '#170B33', border: `1px solid ${C.hairline}`, color: C.silver }}>
              Click to view rights pipeline
            </span>
          )}
        </span>
        <Chip variant="genre">{BRIEF_LABELS[briefId]}</Chip>
        {showPipeline && (
          <button type="button" onClick={() => setShowPipeline(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.lavender, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
        )}
      </div>

      {/* rights pipeline */}
      {showPipeline && !rightsPanel && (
        <RightsPipelineView
          rp={localRightsProfile}
          trackId={result.track.id}
          onOpenIntake={(af) => { setPendingAutoFill(af); setRightsPanel(true); setShowPipeline(false); }}
        />
      )}

      {/* rights intake panel */}
      {rightsPanel && (
        <RightsPanel
          trackId={result.track.id}
          isrc={result.track.isrc}
          existing={localRightsProfile}
          autoFill={pendingAutoFill}
          onSaved={(saved) => {
            const newRp = {
              isOneStop: saved.isOneStop,
              proAffiliation: saved.proAffiliation,
              masterVerifiedAt: saved.masterVerifiedAt,
              masterOwnedBy: saved.masterOwnedBy,
              publisherName: saved.publisherName,
              writerName: saved.writerName,
              blockers: saved.blockers,
              rightsState: saved.rightsState,
              syncLicenseStatus: saved.syncLicenseStatus,
              syncLicensedBy: saved.syncLicensedBy,
              lyricLicenseStatus: saved.lyricLicenseStatus,
              lyricLicensedBy: saved.lyricLicensedBy,
            };
            setLocalRightsProfile(newRp);
            // Recompute rights axis → live score update
            const newRightsAxis = rightsAxisFromBlockers(saved.blockers, Boolean(result.track.isrc));
            setLocalVector(v => ({ ...v, rights: newRightsAxis }));
            setRightsPanel(false);
            setShowPipeline(true);
          }}
          onClose={() => { setRightsPanel(false); setShowPipeline(true); }}
        />
      )}

      {/* rights blockers — only when pipeline is closed */}
      {!showPipeline && !rightsPanel && localRightsProfile?.blockers && localRightsProfile.blockers.length > 0 && (
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

function useWindowWidth() {
  const [w, setW] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return w;
}

export function ResultsScreen({ briefText, briefId, sceneParams, results, readOnly, onBack }: ResultsScreenProps) {
  const [toast, setToast] = useState<string | null>(null);
  const windowWidth = useWindowWidth();
  const isDesktop = windowWidth >= 768;

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
      <div style={{ maxWidth: isDesktop ? 720 : 520, margin: '0 auto', padding: isDesktop ? '0 40px 48px' : '0 20px 48px' }}>

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
