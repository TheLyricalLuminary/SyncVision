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

const ACCEPTED_TYPES = ['.wav', '.mp3', '.aiff', '.aif'];
const ACCEPTED_MIME = ['audio/wav', 'audio/mpeg', 'audio/aiff', 'audio/x-aiff'];

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (ACCEPTED_TYPES.some((ext) => name.endsWith(ext))) return true;
  if (ACCEPTED_MIME.includes(file.type)) return true;
  return false;
}

function isSupportedUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.includes('spotify.com') ||
    trimmed.includes('soundcloud.com') ||
    trimmed.includes('dropbox.com')
  );
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() ?? u.hostname;
    return last.length > 0 ? last : u.hostname;
  } catch {
    return url.slice(0, 60);
  }
}

export function IngestScreen({
  creditBalance,
  onBack,
  onAnalyze,
}: IngestScreenProps) {
  const [tracks, setTracks] = useState<IngestedTrack[]>([]);
  const [urlValue, setUrlValue] = useState('');
  const [isrcValue, setIsrcValue] = useState('');
  const [dropError, setDropError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isrcError, setIsrcError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationFrames = useRef<Map<string, number>>(new Map());
  const uploadXhrs = useRef<Map<string, XMLHttpRequest>>(new Map());

  useEffect(() => {
    const frames = animationFrames.current;
    const xhrs = uploadXhrs.current;
    return () => {
      frames.forEach((id) => window.clearTimeout(id));
      frames.clear();
      xhrs.forEach((xhr) => xhr.abort());
      xhrs.clear();
    };
  }, []);

  const animateProgress = (
    id: string,
    initialStatus: IngestedTrack['status'],
    durationMs: number,
  ) => {
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(100, (elapsed / durationMs) * 100);
      setTracks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                progress,
                status: progress >= 100 ? 'ready' : initialStatus,
              }
            : t,
        ),
      );
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

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = (event.loaded / event.total) * 100;
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId ? { ...t, progress: percent, status: 'uploading' } : t,
        ),
      );
    };

    xhr.onload = () => {
      uploadXhrs.current.delete(trackId);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText) as { filename: string };
          setTracks((prev) =>
            prev.map((t) =>
              t.id === trackId
                ? {
                    ...t,
                    status: 'ready',
                    progress: 100,
                    serverFilename: parsed.filename,
                  }
                : t,
            ),
          );
        } catch {
          setTracks((prev) =>
            prev.map((t) =>
              t.id === trackId
                ? { ...t, status: 'error', errorMessage: 'Invalid server response' }
                : t,
            ),
          );
        }
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        const parsed = JSON.parse(xhr.responseText) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        // keep default
      }
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? { ...t, status: 'error', errorMessage: message }
            : t,
        ),
      );
    };

    xhr.onerror = () => {
      uploadXhrs.current.delete(trackId);
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? { ...t, status: 'error', errorMessage: 'Network error during upload' }
            : t,
        ),
      );
    };

    const formData = new FormData();
    formData.append('audio', file);
    xhr.open('POST', `${API_BASE}/api/tracks/upload`);
    xhr.send(formData);
  };

  const addFiles = (files: FileList | File[]) => {
    const accepted: File[] = [];
    const rejected: File[] = [];
    Array.from(files).forEach((f) => {
      if (isAcceptedFile(f)) accepted.push(f);
      else rejected.push(f);
    });

    if (rejected.length > 0) {
      setDropError(
        `Unsupported file type: ${rejected.map((f) => f.name).join(', ')}. Accepted: WAV, MP3, AIFF.`,
      );
    } else {
      setDropError(null);
    }

    const newTracks: { track: IngestedTrack; file: File }[] = accepted.map((f) => ({
      file: f,
      track: {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        filename: f.name,
        source: 'file',
        status: 'uploading',
        progress: 0,
      },
    }));

    setTracks((prev) => [...prev, ...newTracks.map((n) => n.track)]);
    newTracks.forEach((n) => uploadFile(n.track.id, n.file));
  };

  const handleAddUrl = () => {
    const value = urlValue.trim();
    if (!value) return;
    if (!isSupportedUrl(value)) {
      setUrlError('URL must be from Spotify, SoundCloud, or Dropbox.');
      return;
    }
    setUrlError(null);
    const id = `url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newTrack: IngestedTrack = {
      id,
      filename: filenameFromUrl(value),
      source: 'url',
      status: 'resolving',
      progress: 0,
    };
    setTracks((prev) => [...prev, newTrack]);
    setUrlValue('');
    animateProgress(id, 'resolving', 1800);
  };

  const handleAddIsrc = () => {
    const value = isrcValue.trim().toUpperCase();
    if (!ISRC_FORMAT.test(value)) {
      setIsrcError('Not a valid ISRC format.');
      return;
    }
    setIsrcError(null);
    const id = `isrc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newTrack: IngestedTrack = {
      id,
      filename: value,
      source: 'isrc',
      status: 'ready',
      progress: 100,
    };
    setTracks((prev) => [...prev, newTrack]);
    setIsrcValue('');
  };

  const removeTrack = (id: string) => {
    const handle = animationFrames.current.get(id);
    if (handle != null) {
      window.clearTimeout(handle);
      animationFrames.current.delete(id);
    }
    const xhr = uploadXhrs.current.get(id);
    if (xhr) {
      xhr.abort();
      uploadXhrs.current.delete(id);
    }
    setTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  const readyCount = tracks.filter((t) => t.status === 'ready').length;
  const canAnalyze = readyCount > 0 && creditBalance >= readyCount;
  const insufficientCredits = readyCount > 0 && creditBalance < readyCount;

  return (
    <main className="max-w-3xl mx-auto px-8 py-12">
      <button
        onClick={onBack}
        className="uppercase-label text-xs mb-6"
        type="button"
      >
        ← Back to brief
      </button>

      <h1 className="uppercase-label text-xs mb-4">Ingest Tracks</h1>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className="card p-12 text-center cursor-pointer mb-2"
        style={{
          borderStyle: 'dashed',
          background: isDragging ? 'var(--color-mg-cosmic)' : undefined,
        }}
      >
        <p className="text-mg-silver mb-1">
          Drag and drop audio files here
        </p>
        <p className="uppercase-label text-xs">WAV · MP3 · AIFF · Multi-file</p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {dropError && (
        <p className="text-amber-400 text-xs mb-4">{dropError}</p>
      )}

      <div className="flex gap-2 mb-2 mt-6">
        <input
          type="text"
          value={urlValue}
          onChange={(e) => setUrlValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddUrl();
          }}
          placeholder="Paste a Spotify, SoundCloud, or Dropbox URL"
          className="flex-1 card px-4 py-2 text-mg-silver text-sm placeholder:text-mg-lavender placeholder:opacity-60"
        />
        <button
          type="button"
          onClick={handleAddUrl}
          className="btn-outline text-xs uppercase tracking-[0.12em]"
        >
          Add URL
        </button>
      </div>
      {urlError && <p className="text-amber-400 text-xs mb-4">{urlError}</p>}

      <div className="mt-6 mb-2">
        <div className="uppercase-label text-xs mb-2">Or paste an ISRC</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={isrcValue}
            onChange={(e) => setIsrcValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddIsrc();
            }}
            placeholder="e.g. QZRP52418558"
            className="flex-1 card px-4 py-2 text-mg-silver text-sm placeholder:text-mg-lavender placeholder:opacity-60"
          />
          <button
            type="button"
            onClick={handleAddIsrc}
            className="btn-outline text-xs uppercase tracking-[0.12em]"
          >
            Add
          </button>
        </div>
      </div>
      {isrcError && <p className="text-amber-400 text-xs mb-4">{isrcError}</p>}

      {tracks.length > 0 && (
        <div className="mt-8 mb-8">
          <h2 className="uppercase-label text-xs mb-3">
            Tracks ({tracks.length})
          </h2>
          <ul>
            {tracks.map((t) => (
              <li
                key={t.id}
                className="card px-4 py-3 mb-2 flex items-center gap-4"
              >
                <div className="flex-1">
                  <div className="text-mg-silver text-sm">
                    {t.source === 'isrc' && (
                      <span className="uppercase-label text-[10px] mr-2">ISRC</span>
                    )}
                    {t.filename}
                  </div>
                  {(t.status === 'uploading' || t.status === 'resolving') && (
                    <div className="mt-1">
                      <div
                        className="h-1 rounded"
                        style={{ background: 'var(--color-mg-dim)' }}
                      >
                        <div
                          className="h-1 rounded"
                          style={{
                            width: `${t.progress}%`,
                            background: 'var(--color-mg-lavender)',
                            transition: 'width 50ms linear',
                          }}
                        />
                      </div>
                      <div className="uppercase-label text-[10px] mt-1">
                        {t.status === 'uploading' ? 'Uploading…' : 'Resolving…'}
                      </div>
                    </div>
                  )}
                  {t.status === 'error' && (
                    <div
                      className="uppercase-label text-[10px] mt-1"
                      style={{ color: '#dcaa50' }}
                    >
                      {t.errorMessage ?? 'Upload failed'}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeTrack(t.id)}
                  className="uppercase-label text-xs"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-6 mt-6">
        <button
          type="button"
          onClick={() => {
            const filenames = tracks
              .filter((t) => t.status === 'ready' && t.serverFilename)
              .map((t) => t.serverFilename!);
            if (filenames.length === 0) return;
            onAnalyze(filenames);
          }}
          disabled={!canAnalyze}
          className="btn-outline text-sm uppercase tracking-[0.12em]"
        >
          Analyze →
        </button>
        {readyCount > 0 && (
          <span className="uppercase-label text-xs">
            This analysis will use {readyCount} credit{readyCount === 1 ? '' : 's'}
          </span>
        )}
        {creditBalance === 0 && (
          <span className="text-amber-400 text-xs">
            No credits remaining — upgrade your plan
          </span>
        )}
        {insufficientCredits && (
          <span className="text-amber-400 text-xs">
            Insufficient credits ({creditBalance} of {readyCount} needed)
          </span>
        )}
      </div>
    </main>
  );
}
