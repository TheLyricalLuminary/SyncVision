/**
 * ArcTimeline — the core visualization.
 *
 * One object: waveform + scene arc + song arc + scrub playhead + mismatch markers.
 *
 * Scene arc (magenta dashed) = the emotional ask.
 * Song arc  (amber solid)    = the musical answer.
 * Waveform bars              = the audio texture underneath both.
 * Playhead                   = live position, scrubs both arcs.
 * ⚠ markers                  = where the arcs diverge past tolerance.
 */

import { useState } from 'react';
import type { SceneArc, ArcMatchResult } from '../utils/apiClient';

const MAGENTA  = '#DB2777';
const AMBER    = '#F5B544';
const LAVENDER = '#9B93C4';
const SERIF    = '"Instrument Serif", Georgia, serif';
const MONO     = '"JetBrains Mono", monospace';

// SVG coordinate space
const W       = 600;
const H       = 200;
const PAD_L   = 12;
const PAD_R   = 12;
const PAD_T   = 26; // phase label row
const PAD_B   = 28; // mismatch marker row
const PLOT_W  = W - PAD_L - PAD_R;
const PLOT_H  = H - PAD_T - PAD_B;

const TENSION = 0.35;

const PHASE_LABELS    = ['Opening', 'Held Breath', 'Turn', 'Release'];
const PHASE_FRACTIONS = [0, 1 / 3, 2 / 3, 1];

// 48 bars — denser waveform texture
const WAVE: number[] = [
  28,44,62,55,80,72,90,65,78,55,70,48,62,72,85,78,
  68,90,74,60,80,55,65,70,58,75,48,60,52,45,62,72,
  80,68,55,78,65,50,58,72,85,70,62,75,48,55,62,45,
];

function mapY(val: number): number {
  return PAD_T + PLOT_H * (1 - Math.max(0, Math.min(100, val)) / 100);
}

function mapXf(fraction: number): number {
  return PAD_L + fraction * PLOT_W;
}

function mapXi(phaseIndex: number): number {
  return mapXf(PHASE_FRACTIONS[phaseIndex]);
}

/** Catmull-Rom smooth path through 4 points. */
function smoothPath(pts: [number, number][]): string {
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * TENSION;
    const cp1y = p1[1] + (p2[1] - p0[1]) * TENSION;
    const cp2x = p2[0] - (p3[0] - p1[0]) * TENSION;
    const cp2y = p2[1] - (p3[1] - p1[1]) * TENSION;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Smooth fill polygon between two 4-point curves (scene forward, song backward). */
function gapFillPath(sceneP: [number, number][], songP: [number, number][]): string {
  function curveBody(pts: [number, number][]): string {
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1[0] + (p2[0] - p0[0]) * TENSION;
      const cp1y = p1[1] + (p2[1] - p0[1]) * TENSION;
      const cp2x = p2[0] - (p3[0] - p1[0]) * TENSION;
      const cp2y = p2[1] - (p3[1] - p1[1]) * TENSION;
      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0]},${p2[1]}`;
    }
    return d;
  }
  const rev = [...songP].reverse() as [number, number][];
  return `M ${sceneP[0][0]},${sceneP[0][1]}${curveBody(sceneP)} L ${rev[0][0]},${rev[0][1]}${curveBody(rev)} Z`;
}

// ── Mismatch detection ────────────────────────────────────────────────────────

export type Mismatch = {
  phase: string;
  fraction: number;
  diff: number;   // positive = song above scene
  text: string;
};

const MISMATCH_THRESHOLD = 18;

export function detectMismatches(sceneArc: SceneArc, songArcCurve: number[]): Mismatch[] {
  const phases = [
    { name: 'Opening',     val: sceneArc.opening,    fraction: 0     },
    { name: 'Held Breath', val: sceneArc.heldBreath, fraction: 1 / 3 },
    { name: 'Turn',        val: sceneArc.turn,        fraction: 2 / 3 },
    { name: 'Release',     val: sceneArc.release,     fraction: 1.0   },
  ];

  return phases.flatMap((phase, i) => {
    const diff = (songArcCurve[i] ?? 50) - phase.val;
    if (Math.abs(diff) < MISMATCH_THRESHOLD) return [];

    let text: string;
    const pts = Math.round(Math.abs(diff));

    if (phase.name === 'Opening') {
      text = diff > 0
        ? `Track opens ${pts} points above scene target — too intense for the entry.`
        : `Opening energy ${pts} points short of scene target — track enters too quietly.`;
    } else if (phase.name === 'Held Breath') {
      text = diff > 0
        ? `Track sustains too high through the held moment — ${pts} points above scene.`
        : `Held section is ${pts} points below what the scene needs — tension doesn't build.`;
    } else if (phase.name === 'Turn') {
      text = diff > 0
        ? `Track peaks ${pts} points before the scene needs the turn — emotional beat arrives early.`
        : `Scene demands ${pts} more points of intensity at the turn — track doesn't deliver the pivot.`;
    } else {
      text = diff > 0
        ? `Track doesn't resolve — still ${pts} points above scene's release intensity.`
        : `Release is ${pts} points short — track falls away before the scene does.`;
    }

    return [{ phase: phase.name, fraction: phase.fraction, diff, text }];
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  sceneArc: SceneArc;
  songArcCurve: number[];
  songArcValenceCurve: number[];
  arcMatch: ArcMatchResult;
  playheadFraction?: number;
  onSeek?: (fraction: number) => void;
  isPlaying?: boolean;
};

export function ArcTimeline({
  sceneArc,
  songArcCurve,
  arcMatch,
  playheadFraction = 0,
  onSeek,
  isPlaying = false,
}: Props) {
  const [focusMismatch, setFocusMismatch] = useState<number | null>(null);

  const mismatches = detectMismatches(sceneArc, songArcCurve);

  // Build arc coordinate arrays
  const sceneVals = [sceneArc.opening, sceneArc.heldBreath, sceneArc.turn, sceneArc.release];
  const sceneP = sceneVals.map((v, i) => [mapXi(i), mapY(v)] as [number, number]);
  const songP  = songArcCurve.slice(0, 4).map((v, i) => [mapXi(i), mapY(v)] as [number, number]);

  const scenePath = smoothPath(sceneP);
  const songPath  = smoothPath(songP);
  const gapPath   = gapFillPath(sceneP, songP);

  // Playhead position
  const phX  = mapXf(playheadFraction);
  const seg  = playheadFraction * 3;
  const idx  = Math.min(Math.floor(seg), 2);
  const t    = seg - idx;
  const phSceneY = sceneP[idx][1] + (sceneP[idx + 1][1] - sceneP[idx][1]) * t;
  const phSongY  = songP[idx][1]  + (songP[idx + 1][1]  - songP[idx][1]) * t;

  // Waveform bars
  const barCount = WAVE.length;
  const barW     = PLOT_W / barCount;
  const maxBarH  = PLOT_H * 0.52;

  // Pointer seek (with capture so dragging outside SVG still works)
  const calcFraction = (clientX: number, rect: DOMRect): number => {
    const svgX = (clientX - rect.left) / rect.width * W;
    return Math.min(1, Math.max(0, (svgX - PAD_L) / PLOT_W));
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek?.(calcFraction(e.clientX, e.currentTarget.getBoundingClientRect()));
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.buttons === 0) return;
    onSeek?.(calcFraction(e.clientX, e.currentTarget.getBoundingClientRect()));
  };

  const seekToPhase = (fraction: number) => {
    onSeek?.(fraction);
  };

  return (
    <div>
      {/* Legend row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 14, fontSize: 10, color: LAVENDER }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="20" height="3"><line x1="0" y1="1.5" x2="20" y2="1.5" stroke={MAGENTA} strokeWidth="2" strokeDasharray="5,3" /></svg>
            Scene
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="20" height="3"><line x1="0" y1="1.5" x2="20" y2="1.5" stroke={AMBER} strokeWidth="2" /></svg>
            Track
          </span>
        </div>
        {isPlaying && (
          <span style={{ fontSize: 9, letterSpacing: '0.18em', color: '#4CAF82', fontFamily: MONO }}>● LIVE</span>
        )}
      </div>

      {/* Main SVG */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', cursor: 'crosshair', userSelect: 'none', overflow: 'visible' }}
        aria-label="Arc timeline: scrub to explore scene and track emotional arcs"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        {/* Phase labels */}
        {PHASE_LABELS.map((label, i) => (
          <text
            key={i}
            x={mapXi(i)}
            y={PAD_T - 8}
            textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}
            fontSize="8.5"
            fill="rgba(123,112,178,0.45)"
            letterSpacing="1.8"
            fontFamily="Manrope, system-ui, sans-serif"
          >
            {label.toUpperCase()}
          </text>
        ))}

        {/* Phase tick lines */}
        {PHASE_FRACTIONS.map((f, i) => (
          <line
            key={i}
            x1={mapXf(f)} y1={PAD_T}
            x2={mapXf(f)} y2={PAD_T + PLOT_H}
            stroke="rgba(123,112,178,0.08)" strokeWidth="1"
          />
        ))}

        {/* Horizontal grid at 25 / 50 / 75 */}
        {[25, 50, 75].map(v => (
          <line
            key={v}
            x1={PAD_L} y1={mapY(v)}
            x2={W - PAD_R} y2={mapY(v)}
            stroke="rgba(123,112,178,0.06)" strokeWidth="1"
          />
        ))}

        {/* Waveform bars — background texture */}
        {WAVE.map((h, i) => {
          const bx     = PAD_L + (i / barCount) * PLOT_W;
          const bh     = (h / 100) * maxBarH;
          const by     = PAD_T + PLOT_H - bh;
          const played = (i / barCount) < playheadFraction;
          return (
            <rect
              key={i}
              x={bx + 0.8}
              y={by}
              width={Math.max(1.2, barW - 1.6)}
              height={bh}
              rx="1.5"
              fill={played ? 'rgba(219,39,119,0.22)' : 'rgba(123,112,178,0.09)'}
            />
          );
        })}

        {/* Gap fill — divergence region */}
        <path
          d={gapPath}
          fill="rgba(219,39,119,0.055)"
          stroke="none"
        />

        {/* Song arc — amber, solid, slightly thicker */}
        <path
          d={songPath}
          fill="none"
          stroke={AMBER}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Scene arc — magenta, dashed */}
        <path
          d={scenePath}
          fill="none"
          stroke={MAGENTA}
          strokeWidth="2"
          strokeDasharray="6,4"
          strokeLinecap="round"
        />

        {/* Phase dots */}
        {[0, 1, 2, 3].map(i => (
          <g key={i}>
            <circle cx={sceneP[i][0]} cy={sceneP[i][1]} r="3.5" fill={MAGENTA} />
            <circle cx={songP[i][0]}  cy={songP[i][1]}  r="3.5" fill={AMBER}   />
          </g>
        ))}

        {/* Mismatch markers — bottom row, clickable */}
        {mismatches.map((m, mi) => {
          const mx     = mapXf(m.fraction);
          const my     = PAD_T + PLOT_H + 6;
          const active = focusMismatch === mi;
          return (
            <g
              key={mi}
              onClick={e => { e.stopPropagation(); seekToPhase(m.fraction); setFocusMismatch(active ? null : mi); }}
              style={{ cursor: 'pointer' }}
            >
              {/* Drop line from arc */}
              <line
                x1={mx} y1={PAD_T + PLOT_H}
                x2={mx} y2={my}
                stroke={active ? AMBER : 'rgba(245,181,68,0.3)'} strokeWidth="1" strokeDasharray="2,2"
              />
              {/* Triangle marker */}
              <polygon
                points={`${mx},${my} ${mx - 6},${my + 15} ${mx + 6},${my + 15}`}
                fill={active ? AMBER : 'rgba(245,181,68,0.45)'}
                stroke={active ? AMBER : 'rgba(245,181,68,0.7)'}
                strokeWidth="1"
              />
            </g>
          );
        })}

        {/* Playhead vertical line */}
        <line
          x1={phX} y1={PAD_T}
          x2={phX} y2={PAD_T + PLOT_H}
          stroke="rgba(245,181,68,0.55)" strokeWidth="1.5"
        />

        {/* Playhead — live dots on both arcs */}
        <circle cx={phX} cy={phSceneY} r="4.5" fill={MAGENTA} />
        <circle cx={phX} cy={phSongY}  r="4.5" fill={AMBER}   />

        {/* Playhead — drag handle at top */}
        <circle cx={phX} cy={PAD_T} r="5.5" fill={AMBER} opacity="0.75" />
        <line
          x1={phX - 2} y1={PAD_T - 3}
          x2={phX - 2} y2={PAD_T + 3}
          stroke="rgba(0,0,0,0.4)" strokeWidth="1"
        />
        <line
          x1={phX + 2} y1={PAD_T - 3}
          x2={phX + 2} y2={PAD_T + 3}
          stroke="rgba(0,0,0,0.4)" strokeWidth="1"
        />
      </svg>

      {/* Mismatch annotation list */}
      {mismatches.length > 0 ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mismatches.map((m, mi) => (
            <div
              key={mi}
              onClick={() => { seekToPhase(m.fraction); setFocusMismatch(focusMismatch === mi ? null : mi); }}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 9,
                padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                background: focusMismatch === mi ? 'rgba(245,181,68,0.09)' : 'rgba(245,181,68,0.04)',
                border: `1px solid ${focusMismatch === mi ? 'rgba(245,181,68,0.35)' : 'rgba(245,181,68,0.15)'}`,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <span style={{ fontSize: 12, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>⚠</span>
              <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12, lineHeight: 1.5, color: 'rgba(244,242,250,0.80)' }}>
                {m.text}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: '8px 0 0', fontFamily: SERIF, fontStyle: 'italic', fontSize: 11, color: 'rgba(123,112,178,0.45)', textAlign: 'center' }}>
          Arcs aligned — no significant divergence detected.
        </p>
      )}
    </div>
  );
}
