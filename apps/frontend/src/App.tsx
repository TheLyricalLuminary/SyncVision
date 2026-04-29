import { useEffect, useRef, useState } from 'react'

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

type View = 'scenes' | 'matches' | 'all'
type BannerState = 'ok' | 'violation' | null

// ─── Scene config ─────────────────────────────────────────────────────────────

const SCENES = [
  {
    id: 'chase-tension',
    label: 'Chase / Tension',
    description: 'High arousal, forward motion, rising stakes',
    color: '#ef4444',
  },
  {
    id: 'emotional-resolution',
    label: 'Emotional Resolution',
    description: 'Cathartic release, earned conclusion',
    color: '#3b82f6',
  },
  {
    id: 'triumph-victory',
    label: 'Triumph / Victory',
    description: 'Euphoric energy, peak achievement',
    color: '#f59e0b',
  },
  {
    id: 'grief-loss',
    label: 'Grief / Loss',
    description: 'Low energy, intimate, searching',
    color: '#8b5cf6',
  },
  {
    id: 'romance-intimacy',
    label: 'Romance / Intimacy',
    description: 'Warm, close, unhurried',
    color: '#ec4899',
  },
  {
    id: 'suspense-dread',
    label: 'Suspense / Dread',
    description: 'Uncertainty, foreboding, held breath',
    color: '#6b7280',
  },
  {
    id: 'montage-transition',
    label: 'Montage / Transition',
    description: 'Neutral energy, passage of time',
    color: '#10b981',
  },
  {
    id: 'opening-closing-title',
    label: 'Opening / Closing Title',
    description: 'Establishing tone, bookending the story',
    color: '#2563eb',
  },
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
  return (
    <div
      style={{
        borderTop: '1px solid #334155',
        marginTop: 16,
        paddingTop: 16,
      }}
    >
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
        borderLeft: `4px solid ${scene.color}`,
        border: `1px solid #334155`,
        borderLeftColor: scene.color,
        borderLeftWidth: 4,
        transition: 'border-color 200ms, background 200ms',
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
  return (
    <div
      style={{
        borderTop: '1px solid #334155',
        marginTop: 16,
        paddingTop: 16,
      }}
    >
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
            <h1
              style={{
                fontSize: 32,
                fontWeight: 800,
                margin: 0,
                letterSpacing: '-0.02em',
                color: '#f8fafc',
                cursor: view !== 'scenes' ? 'pointer' : 'default',
              }}
              onClick={() => setView('scenes')}
            >
              SyncVision
            </h1>
            <p style={{ color: '#94a3b8', margin: '6px 0 0', fontSize: 14 }}>
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

            <div style={{ marginTop: 28, textAlign: 'center' }}>
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
