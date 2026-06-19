/**
 * ArcMatchGraph — Story Match overlay: scene arc vs song arc.
 *
 * Hand-coded SVG. No charting library.
 * Scene arc = magenta (the emotional "ask")
 * Song arc  = amber   (the musical "answer")
 *
 * Shows both magnitude curves on the same axes plus three metric pills
 * (magnitude match, valence match, combined score).
 */

import type { SceneArc, ArcMatchResult } from '../utils/apiClient';

const C = {
  magenta:   '#DB2777',
  amber:     '#F5B544',
  lavender:  '#9B93C4',
  silver:    '#F4F2FA',
  hairline:  'rgba(123,112,178,0.16)',
  good:      '#4CAF82',
  bg:        'rgba(7,4,26,0.55)',
};
const SANS = '"Manrope", system-ui, sans-serif';
const MONO = '"JetBrains Mono", monospace';
const SERIF = '"Instrument Serif", Georgia, serif';

/** Labels shown along the X-axis */
const PHASE_LABELS = ['Opening', 'Held Breath', 'Turn', 'Release'];

// SVG coordinate space
const W = 320;
const H = 88;
const PAD_L = 6;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 4;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

/** Map a 0–100 magnitude value to an SVG Y coordinate. */
function mapY(val: number): number {
  return PAD_T + PLOT_H * (1 - Math.max(0, Math.min(100, val)) / 100);
}

/** Map a phase index (0–3) to an SVG X coordinate. */
function mapX(i: number): number {
  return PAD_L + (i / 3) * PLOT_W;
}

/**
 * Build a smooth cubic-bezier SVG path through 4 points using a
 * Catmull-Rom tension of 0.35. Each segment is one C command.
 */
function smoothPath(ys: number[]): string {
  const pts = ys.map((y, i) => [mapX(i), y] as [number, number]);
  const tension = 0.35;
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Fill polygon between two 4-point curves (scene above, song below or vice-versa). */
function gapFill(sceneYs: number[], songYs: number[]): string {
  const fwd = sceneYs.map((y, i) => [mapX(i), y] as [number, number]);
  const rev = [...songYs.map((y, i) => [mapX(i), y] as [number, number])].reverse();
  const tension = 0.35;

  function pathThrough(pts: [number, number][], direction: 1 | -1) {
    const ordered = direction === 1 ? pts : [...pts].reverse();
    let d = `${ordered[0][0]},${ordered[0][1]}`;
    for (let i = 0; i < ordered.length - 1; i++) {
      const p0 = ordered[Math.max(0, i - 1)];
      const p1 = ordered[i];
      const p2 = ordered[i + 1];
      const p3 = ordered[Math.min(ordered.length - 1, i + 2)];
      const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
      const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
      const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
      const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  const fwdPath = pathThrough(fwd, 1);
  const revPath = pathThrough(rev, -1);
  return `M ${fwdPath} L ${revPath[0] === 'C' ? rev[0][0] + ',' + rev[0][1] + ' ' + revPath : rev[0][0] + ',' + rev[0][1]} Z`;
}

function MetricPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.lavender, lineHeight: 1 }}>
        {label}
      </span>
    </div>
  );
}

type Props = {
  sceneArc: SceneArc;
  songArcCurve: number[];      // [0–100] × 4
  songArcValenceCurve: number[]; // [−100…+100] × 4
  arcMatch: ArcMatchResult;
};

export function ArcMatchGraph({ sceneArc, songArcCurve, arcMatch }: Props) {
  const sceneYs = [sceneArc.opening, sceneArc.heldBreath, sceneArc.turn, sceneArc.release].map(mapY);
  const songYs  = songArcCurve.slice(0, 4).map(mapY);

  const scenePath = smoothPath(sceneYs);
  const songPath  = smoothPath(songYs);

  // Phase tick X positions for labels + grid lines
  const ticks = [0, 1, 2, 3].map(mapX);

  const matchColor = arcMatch.combinedScore >= 75 ? C.good
    : arcMatch.combinedScore >= 50 ? C.amber
    : C.lavender;

  return (
    <div style={{
      padding: '14px 16px 12px',
      borderRadius: 14,
      background: C.bg,
      border: `1px solid ${C.hairline}`,
      marginTop: 16,
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 18, height: 1, background: `linear-gradient(90deg,${C.magenta},transparent)`, display: 'inline-block' }} />
          <span style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.lavender }}>
            Story Match
          </span>
        </div>
        {/* legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: C.lavender }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="18" height="3"><line x1="0" y1="1.5" x2="18" y2="1.5" stroke={C.magenta} strokeWidth="2" strokeDasharray="4,2" /></svg>
            Scene
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="18" height="3"><line x1="0" y1="1.5" x2="18" y2="1.5" stroke={C.amber} strokeWidth="2" /></svg>
            Track
          </span>
        </div>
      </div>

      {/* SVG graph */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
        aria-label="Arc match overlay: scene arc vs song arc"
      >
        {/* grid lines at 25 / 50 / 75 */}
        {[25, 50, 75].map(v => (
          <line key={v}
            x1={PAD_L} y1={mapY(v)} x2={W - PAD_R} y2={mapY(v)}
            stroke="rgba(123,112,178,0.10)" strokeWidth="1"
          />
        ))}

        {/* phase tick lines */}
        {ticks.map((x, i) => (
          <line key={i}
            x1={x} y1={PAD_T} x2={x} y2={H - PAD_B}
            stroke="rgba(123,112,178,0.08)" strokeWidth="1"
          />
        ))}

        {/* gap fill between curves */}
        <path
          d={gapFill(sceneYs, songYs)}
          fill="rgba(219,39,119,0.07)"
          stroke="none"
        />

        {/* song arc — amber, solid */}
        <path
          d={songPath}
          fill="none"
          stroke={C.amber}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* scene arc — magenta, dashed */}
        <path
          d={scenePath}
          fill="none"
          stroke={C.magenta}
          strokeWidth="2"
          strokeDasharray="5,3"
          strokeLinecap="round"
        />

        {/* dots at each phase point */}
        {[0, 1, 2, 3].map(i => (
          <g key={i}>
            <circle cx={mapX(i)} cy={sceneYs[i]} r="3" fill={C.magenta} />
            <circle cx={mapX(i)} cy={songYs[i]}  r="3" fill={C.amber}   />
          </g>
        ))}
      </svg>

      {/* phase labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: `0 ${PAD_L}px`, marginTop: 4 }}>
        {PHASE_LABELS.map((label, i) => (
          <span key={i} style={{
            fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'rgba(123,112,178,0.5)',
            textAlign: i === 0 ? 'left' : i === 3 ? 'right' : 'center',
            flex: i === 0 || i === 3 ? 'none' : 1,
          }}>
            {label}
          </span>
        ))}
      </div>

      {/* metric pills */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 28,
        marginTop: 14, paddingTop: 12,
        borderTop: `1px solid ${C.hairline}`,
      }}>
        <MetricPill label="Shape"   value={arcMatch.magnitudeScore} color={C.lavender} />
        <div style={{ width: 1, background: C.hairline, alignSelf: 'stretch' }} />
        <MetricPill label="Valence" value={arcMatch.valenceScore}   color={C.lavender} />
        <div style={{ width: 1, background: C.hairline, alignSelf: 'stretch' }} />
        <MetricPill label="Match"   value={arcMatch.combinedScore}  color={matchColor} />
      </div>

      <p style={{
        margin: '8px 0 0',
        fontFamily: SERIF, fontStyle: 'italic', fontSize: 11,
        color: 'rgba(123,112,178,0.45)', textAlign: 'center',
      }}>
        Dashed = scene arc · Solid = track arc · Closer curves = stronger match
      </p>
    </div>
  );
}
