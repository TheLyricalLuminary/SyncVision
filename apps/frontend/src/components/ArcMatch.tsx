import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  arcMatchScore,
  arcBand,
  ARC_ORDER,
  ALIGN_THRESHOLD,
  ARC_BAND_LABEL,
  ARC_BAND_SENTENCE,
  type ArcSegments,
  type ArcBand,
} from '../engine/arcMatch';

export type { ArcSegments } from '../engine/arcMatch';

/**
 * ArcMatch™ — the single recognizable object of SyncVision.
 *
 * A film scene has an emotional arc. A song has an emotional arc. This component
 * draws both over narrative time and measures how closely they align: matching
 * beats glow gold, divergent beats glow red, and the Story Match Score resolves
 * only after alignment completes.
 *
 * One deterministic engine renders every state (Design System 2.0, slide 08):
 *   • static        — resting overlay: scene gradient, one dashed candidate,
 *                     four segment anchors.
 *   • inspect       — a playhead rides both curves; the segment gap reads live.
 *   • presentation  — axis stripped for the director's room — shapes + verdict.
 *
 * All scoring is delegated to engine/arcMatch.ts, so the same scene + song always
 * draw the same curve and resolve to the same score.
 */

export type ArcMatchMode = 'static' | 'inspect' | 'presentation';

export interface ArcMatchProps {
  /** The scene's emotional arc (the target shape). */
  scene: ArcSegments;
  /** The candidate song's emotional arc. */
  song: ArcSegments;
  /** Render mode. @default 'static' */
  mode?: ArcMatchMode;
  /** Override the score. Omit to use the deterministic Arc Match formula. */
  score?: number;
  trackTitle?: string;
  artist?: string;
  /** Eyebrow context, e.g. "Scene 14 · The Quiet Surrender". */
  sceneLabel?: string;
  /** Play the draw-in + count-up on mount. @default true */
  animate?: boolean;
  /**
   * Audio-driven playhead position, 0–1.
   * When provided the playhead scrubs in real-time with the audio;
   * hover interaction is suppressed while this is set.
   */
  playheadFraction?: number;
  className?: string;
}

// Segment display labels (UI text; the beat keys live in the engine).
const SEGMENT_LABEL: Record<(typeof ARC_ORDER)[number], string> = {
  opening: 'Opening',
  heldBreath: 'Held Breath',
  turn: 'The Turn',
  release: 'Release',
};

const BAND_VAR: Record<ArcBand, string> = {
  excellent: 'var(--arc-excellent)',
  strong: 'var(--arc-strong)',
  partial: 'var(--arc-partial)',
  weak: 'var(--arc-weak)',
};

// ── Geometry ──────────────────────────────────────────────────────────────────
const VW = 640;
const VH = 280;
const PAD = { top: 26, right: 30, bottom: 34, left: 30 };
const PLOT_W = VW - PAD.left - PAD.right;
const PLOT_H = VH - PAD.top - PAD.bottom;
const SAMPLES = 120;
const LAST = ARC_ORDER.length - 1;

type Pt = { x: number; y: number };

const valueToY = (v: number) => PAD.top + (1 - v / 100) * PLOT_H;
const beatX = (i: number) => PAD.left + (i / LAST) * PLOT_W;

/** Catmull-Rom interpolation of one scalar component between four control values. */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Sample a smooth curve through the four beats as a dense polyline in view space. */
function sampleArc(seg: ArcSegments): Pt[] {
  const v = ARC_ORDER.map((k) => seg[k]);
  const ext = [v[0], ...v, v[v.length - 1]]; // duplicate ends for clean tangents
  const pts: Pt[] = [];
  for (let s = 0; s <= SAMPLES; s++) {
    const g = (s / SAMPLES) * LAST; // global position 0..3
    const i = Math.min(Math.floor(g), LAST - 1);
    const lt = g - i;
    const yVal = catmull(ext[i], ext[i + 1], ext[i + 2], ext[i + 3], lt);
    pts.push({ x: PAD.left + (g / LAST) * PLOT_W, y: valueToY(yVal) });
  }
  return pts;
}

const toPath = (pts: Pt[]) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ── Component ──────────────────────────────────────────────────────────────────
export function ArcMatch({
  scene,
  song,
  mode = 'static',
  score,
  trackTitle,
  artist,
  sceneLabel,
  animate = true,
  playheadFraction,
  className,
}: ArcMatchProps) {
  const uid = useId().replace(/:/g, '');
  const finalScore = score ?? arcMatchScore(scene, song);
  const band = arcBand(finalScore);
  const bandColor = BAND_VAR[band];

  const scenePts = useMemo(() => sampleArc(scene), [scene]);
  const songPts = useMemo(() => sampleArc(song), [song]);

  // Per-beat alignment: gold when in step, red when it diverges.
  const beats = useMemo(
    () =>
      ARC_ORDER.map((k, i) => {
        const gap = Math.abs(scene[k] - song[k]);
        return {
          key: k,
          label: SEGMENT_LABEL[k],
          gap,
          aligned: gap <= ALIGN_THRESHOLD,
          x: beatX(i),
          sceneY: valueToY(scene[k]),
          songY: valueToY(song[k]),
        };
      }),
    [scene, song],
  );

  const isPresentation = mode === 'presentation';
  const isInspect = mode === 'inspect';
  const playable = animate && !prefersReducedMotion();

  // ── Score count-up — resolves only AFTER the curves draw in ─────────────────
  // progress 0→1; starts at 1 (resolved) when not animating, so the effect never
  // needs a synchronous setState in its body.
  const [progress, setProgress] = useState(() => (playable ? 0 : 1));
  useEffect(() => {
    if (!playable) return;
    let raf = 0;
    let start = 0;
    const drawIn = 900; // var(--dur-cine) — wait for alignment to complete
    const countUp = 420; // var(--dur-slow)
    const tick = (now: number) => {
      if (!start) start = now;
      const t = now - start;
      if (t < drawIn) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = Math.min(1, (t - drawIn) / countUp);
      setProgress(1 - Math.pow(1 - p, 3)); // decel; setState only inside rAF
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playable]);
  const shownScore = Math.round(finalScore * progress);

  // ── Inspect playhead ────────────────────────────────────────────────────────
  // Audio-driven (playheadFraction prop) takes priority over hover.
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverHead, setHoverHead] = useState<number | null>(null);
  // When audio drives the playhead, suppress hover; otherwise use hover or rest near the turn.
  const headFrac = playheadFraction != null ? playheadFraction : (hoverHead ?? 0.62);
  const showPlayhead = isInspect || playheadFraction != null;
  const headIdx = Math.round(headFrac * SAMPLES);
  const headScene = scenePts[headIdx];
  const headSong = songPts[headIdx];
  // live gap = piecewise-linear value gap at the playhead (about values, not pixels)
  const liveGap = useMemo(() => {
    const g = headFrac * LAST;
    const i = Math.min(Math.floor(g), LAST - 1);
    const lt = g - i;
    const lerp = (s: ArcSegments) => s[ARC_ORDER[i]] + (s[ARC_ORDER[i + 1]] - s[ARC_ORDER[i]]) * lt;
    return Math.round(Math.abs(lerp(scene) - lerp(song)));
  }, [headFrac, scene, song]);

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    // Hover is suppressed when audio drives the playhead
    if (playheadFraction != null || !isInspect || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const xView = ((e.clientX - r.left) / r.width) * VW;
    const f = (xView - PAD.left) / PLOT_W;
    setHoverHead(Math.max(0, Math.min(1, f)));
  };

  return (
    <figure
      className={className}
      style={{
        margin: 0,
        background: isPresentation
          ? 'radial-gradient(120% 120% at 50% 0%, rgba(28,19,64,0.65), var(--surface-canvas) 70%)'
          : 'linear-gradient(180deg, rgba(23,11,51,0.55), rgba(15,8,35,0.72))',
        border: isPresentation ? 'none' : '1px solid var(--hairline)',
        borderRadius: 'var(--radius-2xl)',
        padding: isPresentation ? 'var(--space-12) var(--space-8) var(--space-8)' : 'var(--space-6)',
        boxShadow: isPresentation ? 'none' : 'var(--elev-3)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes arcdraw-${uid} { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes arcfade-${uid} { from { opacity: 0; } to { opacity: 0.85; } }
        .arc-draw-${uid} { stroke-dasharray: 1; animation: arcdraw-${uid} var(--dur-cine, 900ms) var(--ease-decel, cubic-bezier(0,0,.2,1)) forwards; }
        .arc-fade-${uid} { opacity: 0; animation: arcfade-${uid} var(--dur-cine, 900ms) var(--ease-decel, cubic-bezier(0,0,.2,1)) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .arc-draw-${uid} { animation: none; stroke-dasharray: none; }
          .arc-fade-${uid} { animation: none; opacity: 0.85; }
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {!isPresentation && (sceneLabel || trackTitle) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div>
            {sceneLabel && (
              <div className="sv-label" style={{ color: 'var(--accent-secondary)', marginBottom: 4 }}>
                {sceneLabel}
              </div>
            )}
            {trackTitle && (
              <div className="sv-headline" style={{ fontSize: '1.5rem', lineHeight: 1.15 }}>
                {trackTitle}
                {artist && (
                  <span className="sv-body" style={{ color: 'var(--text-muted)' }}>
                    {'  ·  '}
                    {artist}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="sv-label" style={{ color: 'var(--text-muted)' }}>
            Emotional Arc Match
          </div>
        </header>
      )}

      {/* ── The arcs ───────────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        role="img"
        aria-label={`Arc match ${finalScore} of 100 — ${ARC_BAND_LABEL[band]}. ${ARC_BAND_SENTENCE[band]}`}
        style={{ display: 'block', cursor: isInspect ? 'col-resize' : 'default', touchAction: 'none' }}
        onPointerMove={onPointer}
        onPointerLeave={() => setHoverHead(null)}
      >
        <defs>
          <linearGradient id={`scene-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent-tertiary)" />
            <stop offset="100%" stopColor="var(--accent-primary)" />
          </linearGradient>
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-tertiary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent-tertiary)" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* baseline + segment guides (axis stripped in presentation mode) */}
        {!isPresentation &&
          beats.map((b) => (
            <line
              key={`g-${b.key}`}
              x1={b.x}
              y1={PAD.top - 6}
              x2={b.x}
              y2={VH - PAD.bottom}
              stroke="var(--hairline)"
              strokeWidth={1}
            />
          ))}
        <line
          x1={PAD.left}
          y1={VH - PAD.bottom}
          x2={VW - PAD.right}
          y2={VH - PAD.bottom}
          stroke="var(--hairline-strong)"
          strokeWidth={1}
        />

        {/* scene area fill */}
        <path
          d={`${toPath(scenePts)} L${VW - PAD.right},${VH - PAD.bottom} L${PAD.left},${VH - PAD.bottom} Z`}
          fill={`url(#fill-${uid})`}
        />

        {/* song candidate — always dashed; fades in (keeps its dash identity) */}
        <path
          className={playable ? `arc-fade-${uid}` : ''}
          d={toPath(songPts)}
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="6 7"
          opacity={0.85}
        />

        {/* scene — solid, gradient, the hero line that draws in */}
        <path
          className={playable ? `arc-draw-${uid}` : ''}
          d={toPath(scenePts)}
          fill="none"
          stroke={`url(#scene-${uid})`}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
        />

        {/* per-beat alignment anchors: gold = in step, red = diverges */}
        {beats.map((b) => {
          const c = b.aligned ? 'var(--arc-aligned)' : 'var(--arc-mismatch)';
          return (
            <g key={`a-${b.key}`} filter={`url(#glow-${uid})`}>
              <line x1={b.x} y1={b.sceneY} x2={b.x} y2={b.songY} stroke={c} strokeWidth={1.5} opacity={0.5} />
              <circle cx={b.x} cy={b.songY} r={3.4} fill="var(--surface-canvas)" stroke={c} strokeWidth={2} />
              <circle cx={b.x} cy={b.sceneY} r={4.2} fill={c} />
            </g>
          );
        })}

        {/* inspect / audio-driven playhead */}
        {showPlayhead && headScene && headSong && (
          <g>
            <line
              x1={headScene.x}
              y1={PAD.top - 6}
              x2={headScene.x}
              y2={VH - PAD.bottom}
              stroke="var(--accent-primary)"
              strokeWidth={1.5}
              opacity={0.7}
            />
            <circle cx={headScene.x} cy={headScene.y} r={4} fill="var(--accent-primary)" />
            <circle cx={headSong.x} cy={headSong.y} r={3.4} fill="var(--surface-canvas)" stroke="var(--text-secondary)" strokeWidth={2} />
            <g transform={`translate(${Math.min(headScene.x + 10, VW - 92)}, ${PAD.top + 4})`}>
              <rect width="84" height="22" rx="6" fill="var(--surface-panel)" stroke="var(--hairline-strong)" />
              <text x="8" y="15" fill="var(--text-secondary)" style={{ font: '600 11px var(--font-mono)' }}>
                gap {liveGap}
              </text>
            </g>
          </g>
        )}

        {/* axis labels (the four beats) — stripped in presentation */}
        {!isPresentation &&
          beats.map((b) => (
            <text
              key={`t-${b.key}`}
              x={b.x}
              y={VH - PAD.bottom + 20}
              textAnchor="middle"
              fill="var(--text-muted)"
              style={{ font: '500 10px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' } as React.CSSProperties}
            >
              {b.label}
            </text>
          ))}
      </svg>

      {/* ── Verdict: the score, banded, with its one sentence ──────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isPresentation ? 'center' : 'space-between',
          gap: 'var(--space-6)',
          marginTop: isPresentation ? 'var(--space-8)' : 'var(--space-4)',
          flexWrap: 'wrap',
          textAlign: isPresentation ? 'center' : 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              fontSize: isPresentation ? '5.5rem' : '3.25rem',
              lineHeight: 1,
              color: bandColor,
              textShadow: `0 0 34px color-mix(in srgb, ${bandColor} 45%, transparent)`,
            }}
          >
            {shownScore}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="sv-label" style={{ color: bandColor }}>
              {ARC_BAND_LABEL[band]} arc match
            </span>
            {!isPresentation && (
              <span className="sv-label" style={{ color: 'var(--text-muted)' }}>
                Story Match™ Score
              </span>
            )}
          </div>
        </div>

        {isPresentation ? (
          <p
            className="sv-narrative"
            style={{ width: '100%', fontSize: '1.4rem', color: 'var(--text-primary)', marginTop: 'var(--space-2)' }}
          >
            {ARC_BAND_SENTENCE[band]}
          </p>
        ) : (
          <Legend />
        )}
      </div>
    </figure>
  );
}

function Legend() {
  const dot = (c: string) => ({
    width: 8,
    height: 8,
    borderRadius: 999,
    background: c,
    boxShadow: `0 0 10px ${c}`,
    display: 'inline-block',
  });
  return (
    <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
      <span className="sv-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--text-secondary)' }}>
        <i style={dot('var(--arc-aligned)')} /> Aligned
      </span>
      <span className="sv-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--text-secondary)' }}>
        <i style={dot('var(--arc-mismatch)')} /> Diverges
      </span>
    </div>
  );
}

export default ArcMatch;
