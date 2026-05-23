import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../utils/apiClient';

export type IngestedTrack = {
  id: string;
  filename: string;
  serverFilename?: string;
  source: 'file' | 'url' | 'isrc';
  status: 'uploading' | 'resolving' | 'ready' | 'error';
  progress: number;
  errorMessage?: string;
};

const ISRC_FORMAT = /^[A-Z]{2}[A-Z0-9]{10}$/;

type IngestScreenProps = {
  creditBalance: number;
  onBack: () => void;
  onAnalyze: (filenames: string[]) => void;
};

const ACCEPTED_TYPES = ['.mp3'];
const ACCEPTED_MIME  = ['audio/mpeg'];

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (ACCEPTED_TYPES.some(ext => name.endsWith(ext))) return true;
  if (ACCEPTED_MIME.includes(file.type)) return true;
  return false;
}

function isSupportedUrl(value: string): boolean {
  const t = value.trim().toLowerCase();
  return t.includes('spotify.com') || t.includes('soundcloud.com') || t.includes('dropbox.com');
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() ?? u.hostname;
    return last.length > 0 ? last : u.hostname;
  } catch { return url.slice(0, 60); }
}

// ── design tokens ────────────────────────────────────────────
const C = {
  purple:        '#7C3AED',
  magenta:       '#DB2777',
  silver:        '#E2E8F0',
  lavender:      '#A78BFA',
  good:          '#34D399',
  amber:         '#F5B544',
  hairline:      'rgba(167, 139, 250, 0.14)',
  hairlineStrong:'rgba(167, 139, 250, 0.22)',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';
const BG    = `radial-gradient(1200px 700px at 18% 0%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 600px at 82% 100%, rgba(219,39,119,0.10), transparent 60%), #06030F`;

function SvLogo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, letterSpacing: '-0.01em', fontFamily: SANS }}>
      <span className="sv-glyph" style={{ width: 22, height: 22, borderRadius: 7, position: 'relative', flexShrink: 0, background: `conic-gradient(from 210deg at 50% 50%, ${C.purple}, ${C.magenta}, ${C.purple})`, boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset' }} />
      <span style={{ fontSize: 15 }}><b>SyncVision</b></span>
    </span>
  );
}

export function IngestScreen({ creditBalance, onBack, onAnalyze }: IngestScreenProps) {
  const [tracks, setTracks]         = useState<IngestedTrack[]>([]);
  const [urlValue, setUrlValue]     = useState('');
  const [isrcValue, setIsrcValue]   = useState('');
  const [dropError, setDropError]   = useState<string | null>(null);
  const [urlError, setUrlError]     = useState<string | null>(null);
  const [isrcError, setIsrcError]   = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const animationFrames = useRef<Map<string, number>>(new Map());
  const uploadXhrs      = useRef<Map<string, XMLHttpRequest>>(new Map());

  useEffect(() => {
    const frames = animationFrames.current;
    const xhrs = uploadXhrs.current;
    return () => {
      frames.forEach(id => window.clearTimeout(id));
      frames.clear();
      xhrs.forEach(xhr => xhr.abort());
      xhrs.clear();
    };
  }, []);

  const animateProgress = (id: string, initialStatus: IngestedTrack['status'], durationMs: number) => {
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(100, (elapsed / durationMs) * 100);
      setTracks(prev => prev.map(t => t.id === id ? { ...t, progress, status: progress >= 100 ? 'ready' : initialStatus } : t));
      if (progress < 100) {
        const handle = window.setTimeout(tick, 50);
        animationFrames.current.set(id, handle);
      } else {
        animationFrames.current.delete(id);
      }
    };
    tick();
  };

  const uploadFile = (trackId: string, file: File) => {
    const xhr = new XMLHttpRequest();
    uploadXhrs.current.set(trackId, xhr);
    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      const percent = (event.loaded / event.total) * 100;
      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, progress: percent, status: 'uploading' } : t));
    };
    xhr.onload = () => {
      uploadXhrs.current.delete(trackId);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText) as { filename: string };
          setTracks(prev => prev.map(t => t.id === trackId ? { ...t, status: 'ready', progress: 100, serverFilename: parsed.filename } : t));
        } catch {
          setTracks(prev => prev.map(t => t.id === trackId ? { ...t, status: 'error', errorMessage: 'Upload succeeded but the server response was unexpected.' } : t));
        }
        return;
      }
      let message = 'Upload failed. Please try again.';
      if (xhr.status === 413) message = 'File is too large. Please use a file under 200 MB.';
      else if (xhr.status === 415) message = 'File type not supported. Please use MP3.';
      else if (xhr.status === 502 || xhr.status === 503) message = 'Server is temporarily unavailable.';
      else {
        try { const p = JSON.parse(xhr.responseText) as { error?: string }; if (p.error && !/^\w+_\w+$/.test(p.error)) message = p.error; } catch { /* keep default */ }
      }
      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, status: 'error', errorMessage: message } : t));
    };
    xhr.onerror = () => {
      uploadXhrs.current.delete(trackId);
      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, status: 'error', errorMessage: 'Upload failed — check your connection and try again.' } : t));
    };
    const formData = new FormData();
    formData.append('audio', file);
    xhr.open('POST', `${API_BASE}/api/tracks/upload`);
    xhr.send(formData);
  };

  const addFiles = (files: FileList | File[]) => {
    const accepted: File[] = [], rejected: File[] = [];
    Array.from(files).forEach(f => (isAcceptedFile(f) ? accepted : rejected).push(f));
    if (rejected.length > 0) {
      setDropError(`Unsupported: ${rejected.map(f => f.name).join(', ')}. Use MP3.`);
    } else { setDropError(null); }
    const newTracks = accepted.map(f => ({
      file: f,
      track: { id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, filename: f.name, source: 'file' as const, status: 'uploading' as const, progress: 0 },
    }));
    setTracks(prev => [...prev, ...newTracks.map(n => n.track)]);
    newTracks.forEach(n => uploadFile(n.track.id, n.file));
  };

  const handleAddUrl = () => {
    const value = urlValue.trim();
    if (!value) return;
    if (!isSupportedUrl(value)) { setUrlError('URL must be from Spotify, SoundCloud, or Dropbox.'); return; }
    setUrlError(null);
    const id = `url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setTracks(prev => [...prev, { id, filename: filenameFromUrl(value), source: 'url', status: 'resolving', progress: 0 }]);
    setUrlValue('');
    animateProgress(id, 'resolving', 1800);
  };

  const handleAddIsrc = () => {
    const value = isrcValue.trim().toUpperCase();
    if (!ISRC_FORMAT.test(value)) { setIsrcError('Not a valid ISRC format.'); return; }
    setIsrcError(null);
    const id = `isrc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setTracks(prev => [...prev, { id, filename: value, source: 'isrc', status: 'ready', progress: 100 }]);
    setIsrcValue('');
  };

  const removeTrack = (id: string) => {
    const handle = animationFrames.current.get(id);
    if (handle != null) { window.clearTimeout(handle); animationFrames.current.delete(id); }
    const xhr = uploadXhrs.current.get(id);
    if (xhr) { xhr.abort(); uploadXhrs.current.delete(id); }
    setTracks(prev => prev.filter(t => t.id !== id));
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const readyCount = tracks.filter(t => t.status === 'ready').length;
  const canAnalyze = readyCount > 0 && creditBalance >= readyCount;
  const insufficientCredits = readyCount > 0 && creditBalance < readyCount;

  const fieldStyle: React.CSSProperties = {
    flex: 1, padding: '11px 14px',
    background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.hairline}`,
    borderRadius: 11, color: C.silver, fontSize: 13, fontFamily: SANS,
    outline: 'none', minWidth: 0,
  };
  const addBtnStyle: React.CSSProperties = {
    padding: '0 14px', borderRadius: 11,
    background: `rgba(167,139,250,0.10)`, border: `1px solid ${C.hairlineStrong}`,
    color: C.silver, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
    whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: SANS,
  };

  return (
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: BG, display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 520, width: '100%', margin: '0 auto', padding: '8px 20px 28px', display: 'flex', flexDirection: 'column', flex: 1 }}>

        {/* ── header ── */}
        <div style={{ padding: '16px 4px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.hairline}`, flexShrink: 0 }}>
          <SvLogo />
          <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.lavender, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 999, background: 'rgba(167,139,250,0.08)', border: `1px solid ${C.hairline}` }}>
            Credits <b style={{ color: C.silver, fontFamily: SANS, fontWeight: 700, fontSize: 12, letterSpacing: '-0.01em' }}>{creditBalance}</b>
          </span>
        </div>

        {/* ── back link ── */}
        <button
          type="button"
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, marginTop: 14, marginBottom: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, alignSelf: 'flex-start', fontFamily: SANS }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M19 12 H5 M11 6 L5 12 L11 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back to Brief
        </button>

        {/* ── title ── */}
        <div style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.05, letterSpacing: '-0.01em', color: C.silver, fontWeight: 400 }}>
          Add Your <em style={{ fontStyle: 'italic', color: C.lavender }}>Tracks</em>
        </div>
        <div style={{ marginTop: 6, fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, lineHeight: 1.4, color: 'rgba(226,232,240,0.65)' }}>
          Upload the audio you want to check against this scene.
        </div>

        {/* ── dropzone ── */}
        <div
          onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            marginTop: 16, padding: '22px 18px', borderRadius: 16, textAlign: 'center',
            background: isDragging ? 'rgba(124,58,237,0.18)' : 'linear-gradient(180deg, rgba(124,58,237,0.10), rgba(124,58,237,0.02))',
            border: `1.5px dashed ${isDragging ? 'rgba(167,139,250,0.7)' : 'rgba(167,139,250,0.4)'}`,
            cursor: 'pointer', position: 'relative', overflow: 'hidden',
          }}
        >
          <div style={{ width: 40, height: 40, margin: '0 auto 10px', borderRadius: 12, background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(167,139,250,0.3)', display: 'grid', placeItems: 'center', color: C.silver }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 4 V16 M6 10 L12 4 L18 10 M4 20 H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 17, color: C.silver, letterSpacing: '-0.005em' }}>Drag audio files here</div>
          <div style={{ fontSize: 12, color: C.lavender, marginTop: 3 }}>
            or <span style={{ color: C.magenta, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2 }}>browse</span> from your device
          </div>
          <div style={{ marginTop: 12, fontSize: 9, letterSpacing: '0.22em', color: 'rgba(167,139,250,0.6)', textTransform: 'uppercase', fontFamily: '"JetBrains Mono", monospace' }}>
            MP3
          </div>
          <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES.join(',')} multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </div>
        {dropError && <div style={{ fontSize: 11, color: C.amber, marginTop: 6 }}>{dropError}</div>}

        {/* ── OR divider ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 10px' }}>
          <div style={{ flex: 1, height: 1, background: C.hairline }} />
          <span style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, fontFamily: SANS }}>Or paste a link</span>
          <div style={{ flex: 1, height: 1, background: C.hairline }} />
        </div>

        {/* ── URL input ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={urlValue}
              onChange={e => setUrlValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddUrl(); }}
              placeholder="Spotify, SoundCloud, or Dropbox URL"
              style={{ ...fieldStyle }}
            />
            <button type="button" onClick={handleAddUrl} style={addBtnStyle}>ADD</button>
          </div>
          {urlError && <div style={{ fontSize: 11, color: C.amber }}>{urlError}</div>}

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              type="text"
              value={isrcValue}
              onChange={e => setIsrcValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddIsrc(); }}
              placeholder="ISRC · e.g. QZRP52418558"
              style={{ ...fieldStyle, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, letterSpacing: '0.04em' }}
            />
            <button type="button" onClick={handleAddIsrc} style={addBtnStyle}>ADD</button>
          </div>
          {isrcError && <div style={{ fontSize: 11, color: C.amber }}>{isrcError}</div>}
        </div>

        {/* ── track list ── */}
        {tracks.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tracks.map(t => {
              const isUrl = t.source === 'url';
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(167,139,250,0.05)', border: `1px solid ${C.hairline}` }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: isUrl ? 'rgba(219,39,119,0.18)' : 'rgba(124,58,237,0.18)', display: 'grid', placeItems: 'center', fontSize: 8, letterSpacing: '0.06em', fontWeight: 700, color: isUrl ? '#f9a8d4' : C.lavender, fontFamily: '"JetBrains Mono", monospace', flexShrink: 0 }}>
                    {t.source === 'isrc' ? 'ISRC' : isUrl ? 'URL' : 'MP3'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.silver, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.filename}</div>
                    <div style={{ fontSize: 10, color: C.lavender, letterSpacing: '0.04em', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {(t.status === 'uploading' || t.status === 'resolving') && (
                        <>
                          <span>{t.status === 'uploading' ? 'Uploading…' : 'Resolving…'}</span>
                          <div style={{ flex: 1, height: 2, background: 'rgba(167,139,250,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${t.progress}%`, background: `linear-gradient(90deg, ${C.purple}, ${C.magenta})`, transition: 'width 50ms linear' }} />
                          </div>
                        </>
                      )}
                      {t.status === 'ready' && (
                        <span style={{ color: C.good, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12 L10 17 L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          Ready
                        </span>
                      )}
                      {t.status === 'error' && <span style={{ color: C.amber }}>{t.errorMessage ?? 'Upload failed'}</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => removeTrack(t.id)} style={{ width: 22, height: 22, borderRadius: 6, color: C.lavender, display: 'grid', placeItems: 'center', opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer' }} aria-label="remove">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CTA row ── */}
        <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          {tracks.length > 0 && (
            <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavender, whiteSpace: 'nowrap', fontFamily: SANS }}>
              <b style={{ color: C.silver, fontWeight: 700, fontSize: 12, letterSpacing: '-0.01em' }}>{readyCount}</b>{' '}track{readyCount === 1 ? '' : 's'}
            </span>
          )}
          <button
            type="button"
            disabled={!canAnalyze}
            onClick={() => {
              const filenames = tracks.filter(t => t.status === 'ready' && t.serverFilename).map(t => t.serverFilename!);
              if (filenames.length === 0) return;
              onAnalyze(filenames);
            }}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: 13, borderRadius: 14,
              background: canAnalyze ? `linear-gradient(135deg, ${C.purple}, ${C.magenta})` : 'rgba(167,139,250,0.10)',
              color: canAnalyze ? 'white' : C.lavender,
              fontWeight: 700, fontSize: 14, letterSpacing: '0.01em', fontFamily: SANS,
              border: canAnalyze ? 'none' : `1px solid ${C.hairlineStrong}`,
              boxShadow: canAnalyze ? '0 16px 30px -12px rgba(124,58,237,0.55)' : 'none',
              cursor: canAnalyze ? 'pointer' : 'not-allowed',
            }}
          >
            Run Analysis
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12 H19 M13 6 L19 12 L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        {insufficientCredits && (
          <div style={{ fontSize: 11, color: C.amber, marginTop: 6, textAlign: 'center' }}>
            Not enough credits ({creditBalance} available, {readyCount} needed)
          </div>
        )}

      </div>
    </div>
  );
}
