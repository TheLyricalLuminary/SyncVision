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


// ── design tokens ────────────────────────────────────────────
const C = {
  purple:        '#F5A623',
  magenta:       '#DB2777',
  silver:        '#F4F2FA',
  lavender:      '#9B93C4',
  good:          '#34D399',
  amber:         '#F5B544',
  hairline:      'rgba(123, 112, 178, 0.16)',
  hairlineStrong:'rgba(123, 112, 178, 0.30)',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS  = '"Manrope", system-ui, sans-serif';
const BG    = `radial-gradient(900px 600px at 12% 8%, rgba(245,166,35,0.14), transparent 60%), radial-gradient(800px 500px at 95% 100%, rgba(221,122,58,0.10), transparent 60%), #0D0B1E`;

export function IngestScreen({ creditBalance, onBack, onAnalyze }: IngestScreenProps) {
  const [tracks, setTracks]         = useState<IngestedTrack[]>([]);
  const [isrcValue, setIsrcValue]   = useState('');
  const [dropError, setDropError]   = useState<string | null>(null);
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

  const addBtnStyle: React.CSSProperties = {
    padding: '0 14px', borderRadius: 11,
    background: `rgba(123,112,178,0.10)`, border: `1px solid ${C.hairlineStrong}`,
    color: C.silver, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
    whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: SANS,
  };

  return (
    <div style={{ minHeight: '100vh', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', color: C.silver, background: BG }}>
      <style>{`
        @keyframes sv-pulse-dot { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }
        .sv-ing-topbar { position: sticky; top: 0; z-index: 10; background: linear-gradient(180deg,rgba(6,3,15,0.94),rgba(6,3,15,0.6) 70%,transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid ${C.hairline}; }
        .sv-ing-topbar-inner { max-width: 1280px; margin: 0 auto; padding: 14px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .sv-ing-stepper { display: none; align-items: center; gap: 10px; }
        .sv-ing-step { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: rgba(123,112,178,0.6); }
        .sv-ing-step .n { width: 22px; height: 22px; border-radius: 50%; border: 1px solid ${C.hairlineStrong}; display: grid; place-items: center; font-family: "JetBrains Mono",monospace; font-size: 10px; font-weight: 600; color: rgba(123,112,178,0.7); }
        .sv-ing-step.active { color: ${C.silver}; }
        .sv-ing-step.active .n { background: linear-gradient(135deg,${C.purple},${C.magenta}); border-color: transparent; color: white; }
        .sv-ing-step.done .n { background: rgba(245,166,35,0.18); border-color: rgba(123,112,178,0.35); color: ${C.silver}; }
        .sv-ing-tick { width: 18px; height: 1px; background: ${C.hairlineStrong}; display: inline-block; }
        .sv-ing-badge { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: ${C.lavender}; padding: 4px 10px; border-radius: 999px; background: rgba(123,112,178,0.08); border: 1px solid ${C.hairline}; white-space: nowrap; }
        .sv-ing-badge b { color: ${C.silver}; font-weight: 700; }
        .sv-ing-shell { max-width: 1280px; margin: 0 auto; padding: 28px 28px 80px; }
        .sv-ing-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
        .sv-ing-card { border-radius: 18px; background: linear-gradient(180deg,rgba(23,11,51,0.55),rgba(15,8,35,0.72)); border: 1px solid ${C.hairline}; padding: 18px 20px; }
        .sv-ing-card.full { /* mobile: normal flow */ }
        .sv-ing-track-list { display: grid; gap: 10px; grid-template-columns: 1fr; }
        @media (min-width: 880px) {
          .sv-ing-stepper { display: inline-flex; }
          .sv-ing-badge { display: none; }
          .sv-ing-shell { padding: 36px 36px 96px; }
          .sv-ing-grid { grid-template-columns: minmax(0,1.1fr) minmax(0,1fr); gap: 24px; }
          .sv-ing-card.full { grid-column: 1 / -1; }
          .sv-ing-cta { grid-column: 1 / -1; }
          .sv-ing-card { border-radius: 22px; padding: 24px 26px; }
        }
        @media (min-width: 900px) {
          .sv-ing-track-list { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 480px) {
          .sv-ing-shell { padding: 16px 16px 60px; }
          .sv-ing-topbar-inner { padding: 12px 16px; }
        }
      `}</style>

      {/* ── sticky topbar ── */}
      <header className="sv-ing-topbar">
        <div className="sv-ing-topbar-inner">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/logo.png" alt="SyncVision" style={{ height: 28, width: 'auto', display: 'block' }} />
          </div>
          <nav className="sv-ing-stepper" aria-label="Progress">
            <span className="sv-ing-step done"><span className="n"><svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M5 12 L10 17 L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></span> Brief</span>
            <span className="sv-ing-tick" />
            <span className="sv-ing-step active"><span className="n">2</span> Ingest</span>
            <span className="sv-ing-tick" />
            <span className="sv-ing-step"><span className="n">3</span> Match</span>
          </nav>
          <span className="sv-ing-badge">Step <b>2</b> of 3</span>
        </div>
      </header>

      <main className="sv-ing-shell">

        {/* ── hero row ── */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 22, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              type="button"
              onClick={onBack}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: SANS }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M19 12 H5 M11 6 L5 12 L11 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Back to Brief
            </button>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(24px,3.8vw,48px)', lineHeight: 1.02, letterSpacing: '-0.02em', color: C.silver }}>
              Add your <em style={{ fontStyle: 'italic', color: C.lavender }}>candidates.</em>
            </h1>
          </div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(13px,1.3vw,16px)', color: 'rgba(123,112,178,0.7)', marginLeft: 'auto' }}>
            Audio files or ISRCs — we'll handle the rest.
          </div>
        </div>

        <div className="sv-ing-grid">

          {/* Upload card — full width */}
          <section className="sv-ing-card full">
            <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <span>Upload</span>
              <span style={{ color: 'rgba(123,112,178,0.5)', letterSpacing: '0.06em', textTransform: 'none', fontStyle: 'italic', fontFamily: SERIF, fontSize: 12 }}>drop a folder or pick files</span>
            </div>

            {/* ── dropzone ── */}
            <div
              onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '28px 24px', borderRadius: 18, textAlign: 'center',
                background: isDragging
                  ? 'radial-gradient(120% 80% at 50% 0%,rgba(245,166,35,0.26),transparent 60%),linear-gradient(180deg,rgba(245,166,35,0.12),rgba(15,8,35,0.5))'
                  : 'radial-gradient(120% 80% at 50% 0%,rgba(245,166,35,0.18),transparent 60%),linear-gradient(180deg,rgba(245,166,35,0.08),rgba(15,8,35,0.5))',
                border: `1.5px dashed ${isDragging ? 'rgba(123,112,178,0.6)' : 'rgba(123,112,178,0.35)'}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ width: 48, height: 48, margin: '0 auto 14px', borderRadius: 16, background: 'rgba(245,166,35,0.18)', border: '1px solid rgba(123,112,178,0.32)', display: 'grid', placeItems: 'center', color: C.lavender }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 4 V16 M6 10 L12 4 L18 10 M4 20 H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 'clamp(17px,2vw,24px)', color: C.silver, letterSpacing: '-0.005em' }}>Drag audio files here</div>
              <div style={{ fontSize: 13, color: C.lavender, marginTop: 6 }}>
                or <span style={{ color: C.silver, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: C.magenta }}>browse</span> from your device
              </div>
              <div style={{ marginTop: 14, fontSize: 9, letterSpacing: '0.22em', color: 'rgba(123,112,178,0.55)', textTransform: 'uppercase', fontFamily: '"JetBrains Mono", monospace' }}>
                MP3 · ISRC
              </div>
              <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES.join(',')} multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {dropError && <div style={{ fontSize: 11, color: C.amber, marginTop: 8 }}>{dropError}</div>}

            {/* divider-or */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '18px 0 14px', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(123,112,178,0.55)' }}>
              <div style={{ flex: 1, height: 1, background: C.hairline }} />
              <span>Or paste an ISRC</span>
              <div style={{ flex: 1, height: 1, background: C.hairline }} />
            </div>

            {/* ISRC input */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(0,0,0,0.28)', border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '4px 4px 4px 14px' }}>
              <input
                type="text"
                value={isrcValue}
                onChange={e => setIsrcValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddIsrc(); }}
                placeholder="e.g. QZRP52418558"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.silver, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, letterSpacing: '0.04em', padding: '10px 0', minWidth: 0 }}
              />
              <button type="button" onClick={handleAddIsrc} style={{ ...addBtnStyle, borderRadius: 10, padding: '9px 14px', minHeight: 44 }}>ADD</button>
            </div>
            {isrcError && <div style={{ fontSize: 11, color: C.amber, marginTop: 6 }}>{isrcError}</div>}
          </section>

          {/* Queue card */}
          {tracks.length > 0 && (
            <section className="sv-ing-card full">
              <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.lavender, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <span>Queue</span>
                <span style={{ color: 'rgba(123,112,178,0.5)', letterSpacing: '0.06em', textTransform: 'none', fontStyle: 'italic', fontFamily: SERIF, fontSize: 12 }}>{readyCount} ready to analyze</span>
              </div>
              <div className="sv-ing-track-list">
                {tracks.map(t => {
                  const isUrl = t.source === 'url';
                  const iconBg = t.source === 'isrc' ? 'rgba(52,211,153,0.16)' : isUrl ? 'rgba(219,39,119,0.20)' : 'rgba(245,166,35,0.20)';
                  const iconColor = t.source === 'isrc' ? C.good : isUrl ? '#f9a8d4' : C.lavender;
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(123,112,178,0.05)', border: `1px solid ${C.hairline}` }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, display: 'grid', placeItems: 'center', fontSize: 9, letterSpacing: '0.06em', fontWeight: 700, color: iconColor, fontFamily: '"JetBrains Mono", monospace', flexShrink: 0 }}>
                        {t.source === 'isrc' ? 'ISRC' : isUrl ? 'URL' : 'MP3'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: C.silver, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.005em' }}>{t.filename}</div>
                        <div style={{ fontSize: 11, color: C.lavender, letterSpacing: '0.02em', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {(t.status === 'uploading' || t.status === 'resolving') && (
                            <>
                              <span>{t.status === 'uploading' ? 'Uploading…' : 'Resolving…'}</span>
                              <div style={{ flex: 1, height: 2, background: 'rgba(123,112,178,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${t.progress}%`, background: `linear-gradient(90deg, ${C.purple}, ${C.magenta})`, transition: 'width 50ms linear' }} />
                              </div>
                            </>
                          )}
                          {t.status === 'ready' && (
                            <span style={{ color: C.good, display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12 L10 17 L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              Ready
                            </span>
                          )}
                          {t.status === 'error' && <span style={{ color: C.amber }}>{t.errorMessage ?? 'Upload failed'}</span>}
                        </div>
                      </div>
                      <button type="button" onClick={() => removeTrack(t.id)} style={{ width: 28, height: 28, borderRadius: 8, color: C.lavender, display: 'grid', placeItems: 'center', opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer' }} aria-label="remove">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* CTA row */}
          <div className="sv-ing-cta" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {tracks.length > 0 && (
              <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavender, whiteSpace: 'nowrap', fontFamily: SANS }}>
                Tracks <b style={{ color: C.silver, fontWeight: 700, fontSize: 12, letterSpacing: '-0.01em' }}>{readyCount}</b> &nbsp;·&nbsp; Credits <b style={{ color: C.silver, fontWeight: 700, fontSize: 12, letterSpacing: '-0.01em' }}>{creditBalance}</b>
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
                padding: '14px 20px', borderRadius: 14, minHeight: 52,
                background: canAnalyze ? `linear-gradient(135deg, ${C.purple}, ${C.magenta})` : 'rgba(123,112,178,0.10)',
                color: canAnalyze ? 'white' : C.lavender,
                fontWeight: 700, fontSize: 14, letterSpacing: '0.01em', fontFamily: SANS,
                border: canAnalyze ? 'none' : `1px solid ${C.hairlineStrong}`,
                boxShadow: canAnalyze ? '0 16px 30px -12px rgba(245,166,35,0.55)' : 'none',
                cursor: canAnalyze ? 'pointer' : 'not-allowed',
              }}
            >
              Run analysis
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12 H19 M13 6 L19 12 L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          {insufficientCredits && (
            <div style={{ fontSize: 11, color: C.amber, textAlign: 'center' }}>
              Not enough credits ({creditBalance} available, {readyCount} needed)
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
