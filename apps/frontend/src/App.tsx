import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, Dispatch, DragEvent, SetStateAction } from 'react'
import syncVisionLogo from './assets/syncvision-logo.png'

// ─── Shared types ────────────────────────────────────────────────────────────

interface Breakdown {
  rights: number
  metadata: number
  audio: number
  sceneFit: number
}

interface RankedTrack {
  rank: number
  trackId: string
  title: string
  artistName: string | null
  isrc: string
  score: number
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW'
  isOneStop: boolean
  breakdown: Breakdown
  inputHash: string
  explanation: string
  ascapWorkId?: string
}

interface SceneMatch {
  rank: number
  trackId: string
  title: string
  artistName: string | null
  isrc: string
  ascapWorkId: string
  confidenceScore: number
  matchScore: number
  isOneStop: boolean
  clearanceStatement: string
  inputHash: string
  breakdown: Breakdown
  tonalCharacter: string | null
  energyCharacter: string | null
  sonicNarrative: string
}

interface SceneResponse {
  sceneId: string
  sceneLabel: string
  rankedMatches: SceneMatch[]
}

interface ApiResponse {
  rankedTracks: RankedTrack[]
}

type View = 'scenes' | 'matches' | 'all' | 'upload'
type BannerState = 'ok' | 'violation' | null

// ─── Upload screen types ──────────────────────────────────────────────────────

type UploadStatus =
  | 'pending'         // file added, /inspect not yet started
  | 'uploading'       // /inspect upload in progress
  | 'inspected'       // /inspect succeeded; user can edit metadata + queue
  | 'inspect-failed'  // /inspect failed
  | 'queueing'        // /upload in flight
  | 'queued'          // backend has it; awaiting analysis
  | 'analyzing'       // backend is analyzing
  | 'analyzed'        // done
  | 'failed'          // backend analysis failed

interface UploadEntry {
  id: string                          // local React key
  file: File
  status: UploadStatus
  uploadProgress: number              // 0–100, valid while status === 'uploading'
  uploadError: string | null

  serverFilename: string | null       // assigned by backend (UUID-prefixed)
  detectedTitle: string | null
  detectedIsrc: string | null
  isrcSource: 'detected' | 'manual' | null

  title: string
  artistName: string
  isrc: string
  ascapWorkId: string
  writerName: string
  publisherName: string
  proAffiliation: string

  trackId: string | null              // assigned by /upload
  errorReason: string | null          // backend errorReason after a failed analysis
}

// ─── Scene config ─────────────────────────────────────────────────────────────

const SCENES = [
  { id: 'chase-tension',           label: 'Chase / Tension',           description: 'High arousal, forward motion, rising stakes',          color: '#ef4444' },
  { id: 'action-combat',           label: 'Action / Combat',           description: 'Aggressive drive, physical stakes, zero restraint',     color: '#f97316' },
  { id: 'triumph-victory',         label: 'Triumph / Victory',         description: 'Euphoric energy, peak achievement',                     color: '#eab308' },
  { id: 'euphoria-celebration',    label: 'Euphoria / Celebration',    description: 'Uninhibited joy, release, peak positive energy',        color: '#84cc16' },
  { id: 'suspense-dread',          label: 'Suspense / Dread',          description: 'Uncertainty, foreboding, held breath',                  color: '#6366f1' },
  { id: 'horror-psychological',    label: 'Horror / Psychological',    description: 'Dread without release, existential threat',             color: '#7c3aed' },
  { id: 'drama-confrontation',     label: 'Drama / Confrontation',     description: 'Interpersonal stakes, emotional weight',                color: '#db2777' },
  { id: 'urban-gritty',           label: 'Urban / Gritty',            description: 'Street-level tension, rhythmic density',               color: '#64748b' },
  { id: 'romance-intimacy',        label: 'Romance / Intimacy',        description: 'Warm, close, unhurried',                               color: '#ec4899' },
  { id: 'heartbreak-separation',   label: 'Heartbreak / Separation',   description: 'Active loss, the moment of leaving',                   color: '#8b5cf6' },
  { id: 'grief-loss',              label: 'Grief / Loss',              description: 'Low energy, intimate, searching',                      color: '#6b7280' },
  { id: 'contemplative-reflective', label: 'Contemplative / Reflective', description: 'Internal, memory, unresolved emotion',              color: '#0ea5e9' },
  { id: 'emotional-resolution',    label: 'Emotional Resolution',      description: 'Cathartic release, earned conclusion',                 color: '#10b981' },
  { id: 'comedy-light',            label: 'Comedy / Light',            description: 'Playful, socially easy, forward bounce',               color: '#f59e0b' },
  { id: 'quirky-offbeat',          label: 'Quirky / Offbeat',          description: 'Rhythmic unpredictability, tonal wit',                 color: '#a855f7' },
  { id: 'montage-transition',      label: 'Montage / Transition',      description: 'Neutral energy, passage of time',                      color: '#94a3b8' },
  { id: 'opening-closing-title',   label: 'Opening / Closing Title',   description: 'Establishing tone, bookending the story',              color: '#f8fafc' },
  { id: 'cinematic-epic',          label: 'Cinematic / Epic',          description: 'Scale, orchestral weight, consequential',              color: '#1d4ed8' },
  { id: 'corporate-aspirational',  label: 'Corporate / Aspirational',  description: 'Forward momentum, optimistic, professional',           color: '#0891b2' },
  { id: 'nature-pastoral',         label: 'Nature / Pastoral',         description: 'Spacious, organic, unhurried, yields to picture',      color: '#22c55e' },
]

// ─── Shared style constants ───────────────────────────────────────────────────

const BADGE_STYLES: Record<'HIGH' | 'MEDIUM' | 'LOW', { bg: string; color: string }> = {
  HIGH: { bg: '#166534', color: '#d1fae5' },
  MEDIUM: { bg: '#92400e', color: '#fef3c7' },
  LOW: { bg: '#991b1b', color: '#fee2e2' },
}

const BREAKDOWN_MAXES: Record<keyof Breakdown, number> = {
  rights: 65,
  metadata: 20,
  audio: 10,
  sceneFit: 5,
}

const BREAKDOWN_LABELS: Record<keyof Breakdown, string> = {
  rights: 'Rights',
  metadata: 'Metadata',
  audio: 'Audio',
  sceneFit: 'Scene Fit',
}

// ─── Upload screen constants + helpers ────────────────────────────────────────

const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/
const ALLOWED_EXTENSIONS = ['.wav', '.mp3'] as const
const MAX_BATCH_BYTES = 100 * 1024 * 1024 // 100 MB total per batch
const POLL_INTERVAL_MS = 3000

function fileExt(name: string): string {
  const m = name.match(/\.[^.]+$/)
  return m ? m[0].toLowerCase() : ''
}

function isAllowedFile(file: File): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(fileExt(file.name))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

interface InspectResult {
  filename: string
  originalName: string
  sizeBytes: number
  detectedTitle: string | null
  detectedIsrc: string | null
}

function inspectFile(file: File, onProgress: (pct: number) => void): Promise<InspectResult> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.append('files', file, file.name)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/tracks/inspect')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let data: { files?: InspectResult[]; error?: string } = {}
      try { data = JSON.parse(xhr.responseText) } catch { /* keep empty */ }
      if (xhr.status >= 200 && xhr.status < 300 && Array.isArray(data.files) && data.files[0]) {
        resolve(data.files[0])
      } else {
        reject(new Error(data.error ?? `Upload failed (HTTP ${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(fd)
  })
}

const STATUS_BADGES: Record<UploadStatus, { label: string; bg: string; color: string }> = {
  pending:          { label: 'Waiting…',        bg: '#334155', color: '#cbd5e1' },
  uploading:        { label: 'Uploading',       bg: '#1e3a8a', color: '#bfdbfe' },
  inspected:        { label: 'Ready to queue',  bg: '#1e40af', color: '#dbeafe' },
  'inspect-failed': { label: 'Upload failed',   bg: '#7f1d1d', color: '#fee2e2' },
  queueing:         { label: 'Queueing…',       bg: '#1e3a8a', color: '#bfdbfe' },
  queued:           { label: 'Queued',          bg: '#92400e', color: '#fef3c7' },
  analyzing:        { label: 'Analyzing',       bg: '#92400e', color: '#fef3c7' },
  analyzed:         { label: 'Analyzed',        bg: '#166534', color: '#d1fae5' },
  failed:           { label: 'Analysis failed', bg: '#991b1b', color: '#fee2e2' },
}

function isInFlight(status: UploadStatus): boolean {
  return status === 'queued' || status === 'analyzing'
}

function newEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ─── Shared components ────────────────────────────────────────────────────────

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#94a3b8', fontSize: 13 }}>{label}</span>
        <span style={{ color: '#f8fafc', fontSize: 13 }}>
          {value} / {max}
        </span>
      </div>
      <div style={{ background: '#0f172a', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div
          style={{
            background: '#2563eb',
            width: `${pct}%`,
            height: '100%',
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  )
}

// ─── All-tracks screen ────────────────────────────────────────────────────────

function AllDecisionCard({ track }: { track: RankedTrack }) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.pause()
    el.currentTime = 0
    el.load()
  }, [track.trackId])

  return (
    <div
      style={{
        borderTop: '1px solid #334155',
        marginTop: 16,
        paddingTop: 16,
      }}
    >
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={`/api/tracks/${track.trackId}/audio`}
        style={{ width: '100%', marginBottom: 16, borderRadius: 6, accentColor: '#2563eb' }}
      />

      <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, marginBottom: 20, margin: '0 0 20px' }}>
        {track.explanation}
      </p>

      <div style={{ marginBottom: 20 }}>
        {(Object.keys(BREAKDOWN_MAXES) as Array<keyof Breakdown>).map((key) => (
          <ScoreBar
            key={key}
            label={BREAKDOWN_LABELS[key]}
            value={track.breakdown[key]}
            max={BREAKDOWN_MAXES[key]}
          />
        ))}
      </div>

      {track.ascapWorkId && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>ASCAP Work ID</div>
          <div style={{ color: '#f8fafc', fontFamily: 'monospace', fontSize: 13, marginTop: 2 }}>
            {track.ascapWorkId}
          </div>
        </div>
      )}

      <div>
        <div style={{ color: '#94a3b8', fontSize: 12 }}>Verification Hash</div>
        <div
          style={{
            color: '#94a3b8',
            fontFamily: 'monospace',
            fontSize: 11,
            wordBreak: 'break-all',
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          {track.inputHash}
        </div>
        <p style={{ color: '#475569', fontSize: 11, marginTop: 6, marginBottom: 0 }}>
          This hash is identical across every run. Any change indicates a system violation.
        </p>
      </div>
    </div>
  )
}

function TrackCard({
  track,
  expanded,
  onToggle,
}: {
  track: RankedTrack
  expanded: boolean
  onToggle: () => void
}) {
  const badge = BADGE_STYLES[track.confidenceLabel]
  return (
    <div
      onClick={onToggle}
      style={{
        background: '#1e293b',
        borderRadius: 12,
        padding: 20,
        marginBottom: 12,
        cursor: 'pointer',
        border: expanded ? '1px solid #2563eb' : '1px solid transparent',
        transition: 'border-color 200ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: '#2563eb',
            minWidth: 40,
            textAlign: 'center',
            lineHeight: 1,
          }}
        >
          {track.rank}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 16 }}>{track.title}</span>
            <span
              style={{
                background: badge.bg,
                color: badge.color,
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                letterSpacing: '0.05em',
              }}
            >
              {track.confidenceLabel}
            </span>
            {track.isOneStop && (
              <span
                style={{
                  background: '#14532d',
                  color: '#d1fae5',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                ✓ ONE-STOP CLEARED
              </span>
            )}
          </div>
          {track.artistName && (
            <div style={{ color: '#cbd5e1', fontSize: 13, marginTop: 2 }}>{track.artistName}</div>
          )}
          <div
            style={{
              color: '#94a3b8',
              fontFamily: 'monospace',
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {track.isrc}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#f8fafc', lineHeight: 1, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
            {track.score}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>CONFIDENCE</div>
        </div>
      </div>

      {expanded && <AllDecisionCard track={track} />}
    </div>
  )
}

// ─── Scene selection screen ───────────────────────────────────────────────────

function SceneCard({
  scene,
  onClick,
}: {
  scene: (typeof SCENES)[number]
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#1e293b',
        borderRadius: 12,
        padding: 20,
        cursor: 'pointer',
        borderTop: '1px solid #334155',
        borderRight: '1px solid #334155',
        borderBottom: '1px solid #334155',
        borderLeft: `4px solid ${scene.color}`,
        transition: 'background 200ms',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = '#253047'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = '#1e293b'
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, color: '#f8fafc', marginBottom: 6 }}>
        {scene.label}
      </div>
      <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>{scene.description}</div>
    </div>
  )
}

// ─── Scene match screen ───────────────────────────────────────────────────────

function SceneDecisionCard({ match }: { match: SceneMatch }) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.pause()
    el.currentTime = 0
    el.load()
  }, [match.trackId])

  return (
    <div
      style={{
        borderTop: '1px solid #334155',
        marginTop: 16,
        paddingTop: 16,
      }}
    >
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={`/api/tracks/${match.trackId}/audio`}
        style={{ width: '100%', marginBottom: 16, borderRadius: 6, accentColor: '#2563eb' }}
      />

      <p
        style={{
          color: '#f8fafc',
          fontSize: 15,
          lineHeight: 1.7,
          marginBottom: 20,
          margin: '0 0 20px',
        }}
      >
        {match.sonicNarrative}
      </p>

      <div style={{ marginBottom: 20 }}>
        {(Object.keys(BREAKDOWN_MAXES) as Array<keyof Breakdown>).map((key) => (
          <ScoreBar
            key={key}
            label={BREAKDOWN_LABELS[key]}
            value={match.breakdown[key]}
            max={BREAKDOWN_MAXES[key]}
          />
        ))}
      </div>

      {match.ascapWorkId && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>ASCAP Work ID</div>
          <div style={{ color: '#f8fafc', fontFamily: 'monospace', fontSize: 13, marginTop: 2 }}>
            {match.ascapWorkId}
          </div>
        </div>
      )}

      <div>
        <div style={{ color: '#94a3b8', fontSize: 12 }}>Verification Hash</div>
        <div
          style={{
            color: '#94a3b8',
            fontFamily: 'monospace',
            fontSize: 11,
            wordBreak: 'break-all',
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          {match.inputHash}
        </div>
        <p style={{ color: '#475569', fontSize: 11, marginTop: 6, marginBottom: 0 }}>
          This hash is identical across every run. Any change indicates a system violation.
        </p>
      </div>
    </div>
  )
}

function SceneMatchCard({
  match,
  expanded,
  onToggle,
}: {
  match: SceneMatch
  expanded: boolean
  onToggle: () => void
}) {
  const badge = BADGE_STYLES[match.confidenceScore >= 80 ? 'HIGH' : match.confidenceScore >= 60 ? 'MEDIUM' : 'LOW']
  const confidenceLabel = match.confidenceScore >= 80 ? 'HIGH' : match.confidenceScore >= 60 ? 'MEDIUM' : ('LOW' as const)

  return (
    <div
      onClick={onToggle}
      style={{
        background: '#1e293b',
        borderRadius: 12,
        padding: 20,
        marginBottom: 12,
        cursor: 'pointer',
        border: expanded ? '1px solid #2563eb' : '1px solid transparent',
        transition: 'border-color 200ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: '#2563eb',
            minWidth: 40,
            textAlign: 'center',
            lineHeight: 1,
          }}
        >
          {match.rank}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 16 }}>{match.title}</span>
            <span
              style={{
                background: badge.bg,
                color: badge.color,
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                letterSpacing: '0.05em',
              }}
            >
              {confidenceLabel}
            </span>
            {match.isOneStop && (
              <span
                style={{
                  background: '#14532d',
                  color: '#d1fae5',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                ✓ ONE-STOP CLEARED
              </span>
            )}
          </div>
          {match.artistName && (
            <div style={{ color: '#cbd5e1', fontSize: 13, marginTop: 2 }}>{match.artistName}</div>
          )}
          <div
            style={{
              color: '#94a3b8',
              fontFamily: 'monospace',
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {match.isrc}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#f8fafc', lineHeight: 1, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
            {match.matchScore}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>MATCH</div>
        </div>
      </div>

      {expanded && <SceneDecisionCard match={match} />}
    </div>
  )
}

// ─── Upload screen ────────────────────────────────────────────────────────────

const PREVIEWABLE_TYPES = new Set(['audio/wav', 'audio/mpeg'])

function LocalAudioPlayer({ file }: { file: File }) {
  const [src] = useState(() => URL.createObjectURL(file))

  useEffect(() => {
    return () => URL.revokeObjectURL(src)
  }, [src])

  return (
    <audio
      controls
      preload="metadata"
      src={src}
      style={{ width: '100%', marginTop: 12, borderRadius: 6, accentColor: '#2563eb' }}
    />
  )
}

function UploadEntryRow({
  entry,
  onChange,
  onRemove,
  onQueue,
  onRetry,
}: {
  entry: UploadEntry
  onChange: (id: string, patch: Partial<UploadEntry>) => void
  onRemove: (id: string) => void
  onQueue: (id: string) => void
  onRetry: (id: string) => void
}) {
  const badge = STATUS_BADGES[entry.status]
  const isrcValid = ISRC_REGEX.test(entry.isrc.trim())
  const titleValid = entry.title.trim().length > 0
  const isrcMissing = entry.isrc.trim().length === 0
  const canQueue = entry.status === 'inspected' && isrcValid && titleValid
  const locked =
    entry.status === 'queueing' ||
    entry.status === 'queued' ||
    entry.status === 'analyzing' ||
    entry.status === 'analyzed'

  const inputStyle: CSSProperties = {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 6,
    padding: '8px 10px',
    color: '#f8fafc',
    fontSize: 13,
    width: '100%',
    fontFamily: 'inherit',
  }
  const labelStyle: CSSProperties = { color: '#94a3b8', fontSize: 11, marginBottom: 4, display: 'block', letterSpacing: '0.03em' }

  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        border: '1px solid #334155',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.file.name}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{formatBytes(entry.file.size)}</div>
        </div>
        <span
          style={{
            background: badge.bg,
            color: badge.color,
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 4,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {badge.label}
        </span>
        {entry.status !== 'queueing' && entry.status !== 'queued' && entry.status !== 'analyzing' && (
          <button
            onClick={() => onRemove(entry.id)}
            aria-label="Remove file"
            style={{
              background: 'transparent',
              border: '1px solid #475569',
              color: '#94a3b8',
              borderRadius: 6,
              width: 28,
              height: 28,
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {PREVIEWABLE_TYPES.has(entry.file.type) && (
        <LocalAudioPlayer file={entry.file} />
      )}

      {entry.status === 'uploading' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ background: '#0f172a', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div
              style={{
                background: '#2563eb',
                width: `${entry.uploadProgress}%`,
                height: '100%',
                transition: 'width 120ms linear',
              }}
            />
          </div>
          <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>{entry.uploadProgress}%</div>
        </div>
      )}

      {entry.status === 'inspect-failed' && (
        <div style={{ color: '#fca5a5', fontSize: 13, marginTop: 12 }}>
          Upload failed: {entry.uploadError ?? 'unknown error'}
        </div>
      )}

      {(entry.status === 'inspected' || entry.status === 'queueing') && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>TITLE *</label>
              <input
                value={entry.title}
                onChange={(e) => onChange(entry.id, { title: e.target.value })}
                disabled={locked}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>ARTIST NAME</label>
              <input
                value={entry.artistName}
                onChange={(e) => onChange(entry.id, { artistName: e.target.value })}
                disabled={locked}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>
                ISRC *
                {entry.isrcSource === 'detected' && (
                  <span style={{ marginLeft: 6, color: '#22c55e', fontSize: 10, fontWeight: 700 }}>
                    DETECTED FROM ID3
                  </span>
                )}
                {entry.isrcSource === 'manual' && (
                  <span style={{ marginLeft: 6, color: '#94a3b8', fontSize: 10, fontWeight: 700 }}>
                    MANUAL
                  </span>
                )}
              </label>
              <input
                value={entry.isrc}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase()
                  onChange(entry.id, { isrc: next, isrcSource: 'manual' })
                }}
                placeholder="e.g. QZTAW2599999"
                disabled={locked}
                style={{
                  ...inputStyle,
                  fontFamily: 'monospace',
                  borderColor: entry.isrc && !isrcValid ? '#dc2626' : inputStyle.border as string,
                }}
              />
              {isrcMissing && (
                <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 4 }}>
                  ISRC required before this track can be cleared.
                </div>
              )}
              {!isrcMissing && !isrcValid && (
                <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 4 }}>
                  Invalid ISRC format (expected 12 chars, e.g. QZTAW2599999).
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>ASCAP WORK ID</label>
              <input
                value={entry.ascapWorkId}
                onChange={(e) => onChange(entry.id, { ascapWorkId: e.target.value })}
                disabled={locked}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>WRITER NAME</label>
              <input
                value={entry.writerName}
                onChange={(e) => onChange(entry.id, { writerName: e.target.value })}
                disabled={locked}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>PUBLISHER NAME</label>
              <input
                value={entry.publisherName}
                onChange={(e) => onChange(entry.id, { publisherName: e.target.value })}
                disabled={locked}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>PRO AFFILIATION</label>
              <input
                value={entry.proAffiliation}
                onChange={(e) => onChange(entry.id, { proAffiliation: e.target.value })}
                placeholder="ASCAP, BMI, SESAC…"
                disabled={locked}
                style={inputStyle}
              />
            </div>
          </div>

          {entry.uploadError && entry.status === 'inspected' && (
            <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 12 }}>
              Queue failed: {entry.uploadError}
            </div>
          )}

          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => onQueue(entry.id)}
              disabled={!canQueue}
              style={{
                background: canQueue ? '#2563eb' : '#1e293b',
                color: canQueue ? '#fff' : '#64748b',
                border: canQueue ? 'none' : '1px solid #334155',
                borderRadius: 8,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: canQueue ? 'pointer' : 'not-allowed',
              }}
            >
              {entry.status === 'queueing' ? 'Queueing…' : 'Queue Track'}
            </button>
          </div>
        </div>
      )}

      {entry.status === 'failed' && (
        <div style={{ marginTop: 12 }}>
          {entry.errorReason && (
            <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 10 }}>
              Reason: {entry.errorReason}
            </div>
          )}
          <button
            onClick={() => onRetry(entry.id)}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function UploadScreen({
  entries,
  setEntries,
  onBack,
}: {
  entries: UploadEntry[]
  setEntries: Dispatch<SetStateAction<UploadEntry[]>>
  onBack: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  function patchEntry(id: string, patch: Partial<UploadEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  function startInspect(entryId: string, file: File) {
    patchEntry(entryId, { status: 'uploading', uploadProgress: 0, uploadError: null })
    inspectFile(file, (pct) => {
      setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, uploadProgress: pct } : e)))
    })
      .then((result) => {
        setEntries((prev) =>
          prev.map((e) => {
            if (e.id !== entryId) return e
            return {
              ...e,
              status: 'inspected',
              uploadProgress: 100,
              serverFilename: result.filename,
              detectedTitle: result.detectedTitle,
              detectedIsrc: result.detectedIsrc,
              isrcSource: result.detectedIsrc ? 'detected' : null,
              title: e.title || result.detectedTitle || stripExt(e.file.name),
              isrc: e.isrc || (result.detectedIsrc ?? ''),
            }
          }),
        )
      })
      .catch((err: Error) => {
        patchEntry(entryId, { status: 'inspect-failed', uploadError: err.message })
      })
  }

  function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return
    const incoming = Array.from(fileList)
    const errors: string[] = []
    const accepted: UploadEntry[] = []

    const existingNames = new Set(entries.map((e) => e.file.name))
    let runningBytes = entries.reduce((sum, e) => sum + e.file.size, 0)

    for (const file of incoming) {
      if (!isAllowedFile(file)) {
        errors.push(`${file.name}: only WAV and MP3 are accepted.`)
        continue
      }
      if (existingNames.has(file.name)) {
        errors.push(`${file.name}: a file with this name is already in the batch.`)
        continue
      }
      if (runningBytes + file.size > MAX_BATCH_BYTES) {
        errors.push(`${file.name}: would exceed the 100 MB batch limit.`)
        continue
      }
      existingNames.add(file.name)
      runningBytes += file.size

      accepted.push({
        id: newEntryId(),
        file,
        status: 'pending',
        uploadProgress: 0,
        uploadError: null,
        serverFilename: null,
        detectedTitle: null,
        detectedIsrc: null,
        isrcSource: null,
        title: '',
        artistName: '',
        isrc: '',
        ascapWorkId: '',
        writerName: '',
        publisherName: '',
        proAffiliation: '',
        trackId: null,
        errorReason: null,
      })
    }

    setValidationErrors(errors)

    if (accepted.length > 0) {
      setEntries((prev) => [...prev, ...accepted])
      // Kick off inspect for each new file. The state update above doesn't need to
      // settle first since startInspect only consults the entry id.
      for (const entry of accepted) {
        startInspect(entry.id, entry.file)
      }
    }
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  function queueOne(id: string) {
    const entry = entries.find((e) => e.id === id)
    if (!entry || !entry.serverFilename) return
    if (!ISRC_REGEX.test(entry.isrc) || entry.title.trim().length === 0) return

    patchEntry(id, { status: 'queueing', uploadError: null })

    fetch('/api/tracks/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracks: [
          {
            filename: entry.serverFilename,
            title: entry.title.trim(),
            artistName: entry.artistName.trim() || undefined,
            isrc: entry.isrc.trim().toUpperCase(),
            ascapWorkId: entry.ascapWorkId.trim() || undefined,
            writerName: entry.writerName.trim() || undefined,
            publisherName: entry.publisherName.trim() || undefined,
            proAffiliation: entry.proAffiliation.trim() || undefined,
          },
        ],
      }),
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as {
          tracks?: Array<{ id: string; status: string; error?: string }>
          error?: string
        }
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
        const created = data.tracks?.[0]
        if (!created || created.status === 'error') {
          throw new Error(created?.error ?? 'Backend rejected the track')
        }
        patchEntry(id, { status: 'queued', trackId: created.id, uploadError: null })
      })
      .catch((err: Error) => {
        patchEntry(id, { status: 'inspected', uploadError: err.message })
      })
  }

  function retryOne(id: string) {
    const entry = entries.find((e) => e.id === id)
    if (!entry?.trackId) return
    patchEntry(id, { status: 'queued', errorReason: null })
    fetch(`/api/tracks/${entry.trackId}/retry`, { method: 'POST' })
      .then(async (r) => {
        if (!r.ok) {
          const data = (await r.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error ?? `HTTP ${r.status}`)
        }
      })
      .catch((err: Error) => {
        patchEntry(id, { status: 'failed', errorReason: err.message })
      })
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const totalBytes = entries.reduce((sum, e) => sum + e.file.size, 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button
          onClick={onBack}
          aria-label="Back to scene selection"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#2563eb',
            fontSize: 20,
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f8fafc' }}>Add Tracks</h2>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24, marginTop: 6 }}>
        Drop WAV or MP3 files to inspect ID3 tags, fill in rights metadata, and queue for analysis.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#2563eb' : '#334155'}`,
          background: dragOver ? '#1e293b' : '#0f172a',
          borderRadius: 12,
          padding: '36px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 150ms, background 150ms',
        }}
      >
        <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
          Drop files here or click to browse
        </div>
        <div style={{ color: '#94a3b8', fontSize: 13 }}>
          WAV / MP3 · up to 100 MB total per batch · {formatBytes(totalBytes)} used
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".wav,.mp3,audio/wav,audio/mpeg,audio/mp3"
          onChange={onPick}
          style={{ display: 'none' }}
        />
      </div>

      {validationErrors.length > 0 && (
        <div
          style={{
            background: '#450a0a',
            border: '1px solid #7f1d1d',
            borderRadius: 10,
            padding: 14,
            marginTop: 16,
            color: '#fca5a5',
            fontSize: 13,
          }}
        >
          {validationErrors.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        {entries.map((entry) => (
          <UploadEntryRow
            key={entry.id}
            entry={entry}
            onChange={patchEntry}
            onRemove={removeEntry}
            onQueue={queueOne}
            onRetry={retryOne}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Root app ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>('scenes')

  // Scene matches state
  const [sceneData, setSceneData] = useState<SceneResponse | null>(null)
  const [sceneLoading, setSceneLoading] = useState(false)
  const [sceneError, setSceneError] = useState<string | null>(null)
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null)

  // All-tracks state
  const [tracks, setTracks] = useState<RankedTrack[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [banner, setBanner] = useState<BannerState>(null)
  const prevHashes = useRef<Record<string, string>>({})
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Upload screen state — held at App level so polling continues across nav.
  const [uploadEntries, setUploadEntries] = useState<UploadEntry[]>([])
  const hasInFlight = uploadEntries.some((e) => isInFlight(e.status))

  useEffect(() => {
    if (!hasInFlight) return
    let cancelled = false

    const tick = () => {
      fetch('/api/tracks')
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json() as Promise<{
            tracks: Array<{ id: string; trackStatus: string; errorReason: string | null }>
          }>
        })
        .then((data) => {
          if (cancelled) return
          const byId = new Map(data.tracks.map((t) => [t.id, t]))
          setUploadEntries((prev) =>
            prev.map((e) => {
              if (!e.trackId) return e
              const t = byId.get(e.trackId)
              if (!t) return e
              const newStatus: UploadStatus =
                t.trackStatus === 'analyzed' ? 'analyzed' :
                t.trackStatus === 'failed'   ? 'failed' :
                t.trackStatus === 'analyzing' ? 'analyzing' :
                'queued'
              if (e.status === newStatus && e.errorReason === t.errorReason) return e
              return { ...e, status: newStatus, errorReason: t.errorReason }
            }),
          )
        })
        .catch(() => { /* swallow — next tick will retry */ })
    }

    tick()
    const interval = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [hasInFlight])

  function showBanner(state: BannerState) {
    setBanner(state)
    if (bannerTimer.current) clearTimeout(bannerTimer.current)
    bannerTimer.current = setTimeout(() => setBanner(null), 4000)
  }

  function loadScores(isRerun = false) {
    setLoading(true)
    setError(null)
    fetch('/api/scores')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ApiResponse>
      })
      .then((data) => {
        const newTracks = data.rankedTracks
        if (isRerun && Object.keys(prevHashes.current).length > 0) {
          const violation = newTracks.some(
            (t) =>
              prevHashes.current[t.trackId] !== undefined &&
              prevHashes.current[t.trackId] !== t.inputHash,
          )
          showBanner(violation ? 'violation' : 'ok')
        }
        const hashMap: Record<string, string> = {}
        newTracks.forEach((t) => {
          hashMap[t.trackId] = t.inputHash
        })
        prevHashes.current = hashMap
        setTracks(newTracks)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (view === 'all' && tracks === null) {
      loadScores(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  function handleSceneSelect(sceneId: string, sceneLabel: string) {
    setExpandedMatch(null)
    setSceneData(null)
    setSceneError(null)
    setSceneLoading(true)
    setView('matches')
    fetch(`/api/scores/scene/${sceneId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<SceneResponse>
      })
      .then((data) => {
        // Ensure the response carries the label we expect
        setSceneData({ ...data, sceneLabel: data.sceneLabel || sceneLabel })
      })
      .catch((err: Error) => setSceneError(err.message))
      .finally(() => setSceneLoading(false))
  }

  function handleToggle(trackId: string) {
    setExpanded((prev) => (prev === trackId ? null : trackId))
  }

  function handleMatchToggle(trackId: string) {
    setExpandedMatch((prev) => (prev === trackId ? null : trackId))
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        fontFamily: "'Inter', system-ui, sans-serif",
        color: '#f8fafc',
        margin: 0,
      }}
    >
      <style>{`
        .scene-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 600px) {
          .scene-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {banner && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: banner === 'ok' ? '#14532d' : '#7f1d1d',
            color: banner === 'ok' ? '#d1fae5' : '#fee2e2',
            textAlign: 'center',
            padding: '12px 20px',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {banner === 'ok'
            ? 'All hashes verified — output is deterministic'
            : 'DETERMINISM VIOLATION — contact system administrator'}
        </div>
      )}

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px' }}>
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 40,
          }}
        >
          <div>
            <img
              src={syncVisionLogo}
              alt="SyncVision"
              onClick={() => setView('scenes')}
              style={{
                height: 52,
                display: 'block',
                mixBlendMode: 'screen',
                cursor: view !== 'scenes' ? 'pointer' : 'default',
              }}
            />
            <p style={{ color: '#94a3b8', margin: '4px 0 0', fontSize: 14 }}>
              <a
                href="/api/determinism-report"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#94a3b8', textDecoration: 'none', borderBottom: '1px solid #475569' }}
              >
                Deterministic Music Rights Verification
              </a>
            </p>
          </div>
          {view === 'all' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                loadScores(true)
              }}
              disabled={loading}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                fontWeight: 600,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Loading…' : 'Run Again'}
            </button>
          )}
        </div>

        {/* ── Screen: scenes ── */}
        {view === 'scenes' && (
          <div>
            <p style={{ color: '#94a3b8', fontSize: 15, marginBottom: 28, marginTop: 0 }}>
              Select a placement type to find your cleared tracks.
            </p>

            <div className="scene-grid">
              {SCENES.map((scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  onClick={() => handleSceneSelect(scene.id, scene.label)}
                />
              ))}
            </div>

            <div style={{ marginTop: 28, display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center' }}>
              <button
                onClick={() => setView('upload')}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 20px',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                + Add Tracks
              </button>
              <button
                onClick={() => setView('all')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: 14,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                View All Tracks
              </button>
            </div>
          </div>
        )}

        {/* ── Screen: matches ── */}
        {view === 'matches' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <button
                onClick={() => setView('scenes')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: 20,
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                }}
                aria-label="Back to scene selection"
              >
                ←
              </button>
              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#f8fafc',
                }}
              >
                {sceneData?.sceneLabel ?? '…'}
              </h2>
            </div>

            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 28, marginTop: 6 }}>
              Showing cleared tracks ranked for this placement.
            </p>

            {sceneLoading && (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: '60px 0', fontSize: 15 }}>
                Fetching matches…
              </div>
            )}

            {sceneError && (
              <div
                style={{
                  background: '#450a0a',
                  border: '1px solid #7f1d1d',
                  borderRadius: 10,
                  padding: 20,
                  color: '#fca5a5',
                  textAlign: 'center',
                }}
              >
                <strong>Error:</strong> {sceneError}
              </div>
            )}

            {sceneData && !sceneError && (
              <div>
                {sceneData.rankedMatches.map((match) => (
                  <SceneMatchCard
                    key={match.trackId}
                    match={match}
                    expanded={expandedMatch === match.trackId}
                    onToggle={() => handleMatchToggle(match.trackId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Screen: upload ── */}
        {view === 'upload' && (
          <UploadScreen
            entries={uploadEntries}
            setEntries={setUploadEntries}
            onBack={() => setView('scenes')}
          />
        )}

        {/* ── Screen: all tracks ── */}
        {view === 'all' && (
          <div>
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 28, marginTop: -28 }}>
              <button
                onClick={() => setView('scenes')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                ← Scene Selection
              </button>
            </p>

            {loading && !tracks && (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: '60px 0', fontSize: 15 }}>
                Fetching tracks…
              </div>
            )}

            {error && (
              <div
                style={{
                  background: '#450a0a',
                  border: '1px solid #7f1d1d',
                  borderRadius: 10,
                  padding: 20,
                  color: '#fca5a5',
                  textAlign: 'center',
                }}
              >
                <strong>Error:</strong> {error}
              </div>
            )}

            {tracks && !error && (
              <div>
                {tracks.map((track) => (
                  <TrackCard
                    key={track.trackId}
                    track={track}
                    expanded={expanded === track.trackId}
                    onToggle={() => handleToggle(track.trackId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
