/**
 * NarrativeArcCanvas — hero visualization for Narrative Fit Studio.
 *
 * Renders scene arc and song arc on the same coordinate system.
 * Divergence regions are colored by alignment strength.
 * Markers indicate scene turn, climax, and release.
 *
 * Hand-coded SVG. No charting library.
 */

import type { SceneArc, ArcMatchResult } from '../utils/apiClient';

const C = {
  magenta:  '#DB2777',
  amber:    '#F5B544',
  lavender: '#9B93C4',
  silver:   '#F4F2FA',
  good:     '#4CAF82',
  hairline: 'rgba(123,112,178,0.13)',
  aligned:  'rgba(76,175,130,0.18)',
  drift:    'rgba(245,181,68,0.22)',
  diverge:  'rgba(232,90,90,0.22)',
  bg:       'rgba(7,4,26,0.72)',
};

const SANS  = '"Manrope", system-ui, sans-serif';
const MONO  = '"JetBrains Mono", monospace';
const SERIF = '"Instrument Serif", Georgia, serif';

const W = 640;
const H = 172;
const PAD_L = 30;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 30;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

// 9 control points — richer curve than 4-phase, matches narrative shape
// x positions normalized 0–1
const XN: readonly number[] = [0, 1/8, 1/4, 5/12, 1/2, 7/12, 3/4, 7/8, 1];

function mapX(xn: number): number {
  return PAD_L + xn * PLOT_W;
}

function mapY(val: number): number {
  return PAD_T + PLOT_H * (1 - Math.max(0, Math.min(100, val)) / 100);
}

/**
 * Expand 4-phase arc (opening, held, turn, release) into 9 control points
 * that follow a principled narrative shape:
 *   i=0  x=0       pre-scene silence / establishing
 *   i=1  x=1/8     scene opens
 *   i=2  x=1/4     opening (as defined)
 *   i=3  x=5/12    held breath builds
 *   i=4  x=1/2     held breath peak (tension plateau)
 *   i=5  x=7/12    pre-turn surge
 *   i=6  x=3/4     turn / climax
 *   i=7  x=7/8     release proper
 *   i=8  x=1       aftermath decay
 */
function expandArc(opening: number, held: number, turn: number, release: number): number[] {
  return [
    opening * 0.28,
    opening * 0.74,
    opening,
    opening * 0.45 + held * 0.55,
    held,
    held * 0.50 + turn * 0.50,
    turn,
    release,
    release * 0.25,
  ];
}

function catmullPath(pts: [number, number][]): string {
  const tension = 0.35;
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

type Region = {
  x1: number; x2: number;
  sy1: number; sy2: number;
  ny1: number; ny2: number;
  delta: number;
};

function divergenceRegions(sceneYs: number[], songYs: number[]): Region[] {
  return XN.slice(0, -1).map((xn, i) => ({
    x1: mapX(xn),
    x2: mapX(XN[i + 1]),
    sy1: sceneYs[i],
    sy2: sceneYs[i + 1],
    ny1: songYs[i],
    ny2: songYs[i + 1],
    delta: (Math.abs(sceneYs[i] - songYs[i]) + Math.abs(sceneYs[i + 1] - songYs[i + 1])) / 2,
  }));
}

function regionFill(delta: number): string {
  if (delta < 9)  return C.aligned;
  if (delta < 22) return C.drift;
  return C.diverge;
}

export type DivergenceSegment = {
  label: string;
  description: string;
  severity: 'ok' | 'warn' | 'fail';
};

export function computeDivergenceSegments(
  sceneArc: SceneArc | null,
  songPhases: number[],
): DivergenceSegment[] {
  const [sO, sH, sT, sR] = sceneArc
    ? [sceneArc.opening, sceneArc.heldBreath, sceneArc.turn, sceneArc.release]
    : [40, 55, 75, 55];
  const [nO, nH, nT, nR] = songPhases.slice(0, 4);

  const segments: DivergenceSegment[] = [];

  // Tension plateau check
  const tensionGap = nH - sH;
  if (tensionGap < -20) {
    segments.push({
      label: 'Tension plateau',
      description: `Tension plateau is ${Math.abs(Math.round(tensionGap))} points below scene requirement.`,
      severity: 'fail',
    });
  } else if (Math.abs(tensionGap) <= 12) {
    segments.push({
      label: 'Tension plateau',
      description: 'Tension builds alongside the scene through the held-breath phase.',
      severity: 'ok',
    });
  } else {
    segments.push({
      label: 'Tension plateau',
      description: `Tension plateau overshoots the scene by ${Math.round(tensionGap)} points.`,
      severity: 'warn',
    });
  }

  // Climax location check
  const sceneClimaxIdx  = [sO, sH, sT, sR].indexOf(Math.max(sO, sH, sT, sR));
  const songClimaxIdx   = [nO, nH, nT, nR].indexOf(Math.max(nO, nH, nT, nR));
  const phaseLabels = ['Opening', 'Held Breath', 'Turn', 'Release'];

  if (songClimaxIdx < sceneClimaxIdx) {
    const phaseCount = sceneClimaxIdx - songClimaxIdx;
    segments.push({
      label: 'Peak timing',
      description: `Emotional peak arrives ${phaseCount === 1 ? 'one phase' : `${phaseCount} phases`} before the scene climax — in ${phaseLabels[songClimaxIdx]}, not ${phaseLabels[sceneClimaxIdx]}.`,
      severity: 'fail',
    });
  } else if (songClimaxIdx > sceneClimaxIdx) {
    segments.push({
      label: 'Peak timing',
      description: `Emotional peak arrives after the scene climax, in the ${phaseLabels[songClimaxIdx]} phase.`,
      severity: 'warn',
    });
  } else {
    segments.push({
      label: 'Peak timing',
      description: `Climax aligns with the scene turning point — both peak in the ${phaseLabels[sceneClimaxIdx]} phase.`,
      severity: 'ok',
    });
  }

  // Release timing check
  const releaseGap = nR - sR;
  if (Math.abs(releaseGap) <= 14) {
    segments.push({
      label: 'Release timing',
      description: 'Emotional release occurs after the turning point and matches the scene resolution.',
      severity: 'ok',
    });
  } else if (releaseGap > 14) {
    segments.push({
      label: 'Release timing',
      description: `Resolution phase maintains ${Math.round(releaseGap)} points more intensity than the scene — decay is absent.`,
      severity: 'warn',
    });
  } else {
    segments.push({
      label: 'Release timing',
      description: `Emotional release collapses ${Math.abs(Math.round(releaseGap))} points below the scene — resolution is cut short.`,
      severity: 'fail',
    });
  }

  // Trajectory overall
  const meanDelta = ([nO - sO, nH - sH, nT - sT, nR - sR].reduce((a, b) => a + Math.abs(b), 0)) / 4;
  if (meanDelta < 10) {
    segments.push({
      label: 'Trajectory',
      description: 'Emotional trajectory tracks the scene closely across all four phases.',
      severity: 'ok',
    });
  } else if (meanDelta < 22) {
    segments.push({
      label: 'Trajectory',
      description: `Emotional trajectory drifts moderately — mean deviation of ${Math.round(meanDelta)} points across phases.`,
      severity: 'warn',
    });
  } else {
    segments.push({
      label: 'Trajectory',
      description: `Emotional trajectory diverges significantly — mean deviation of ${Math.round(meanDelta)} points. A different emotional journey.`,
      severity: 'fail',
    });
  }

  return segments;
}

type Props = {
  sceneArc: SceneArc | null;
  songArcCurve: number[];
  arcMatch?: ArcMatchResult;
  sceneLengthSec?: number | null;
};

export function NarrativeArcCanvas({ sceneArc, songArcCurve, arcMatch, sceneLengthSec }: Props) {
  const scenePhases: [number, number, number, number] = sceneArc
    ? [sceneArc.opening, sceneArc.heldBreath, sceneArc.turn, sceneArc.release]
    : [35, 52, 78, 54];

  const songPhases: [number, number, number, number] =
    songArcCurve.length >= 4
      ? [songArcCurve[0], songArcCurve[1], songArcCurve[2], songArcCurve[3]]
      : [40, 55, 70, 50];

  const sceneYs = expandArc(...scenePhases).map(mapY);
  const songYs  = expandArc(...songPhases).map(mapY);

  const scenePts: [number, number][] = XN.map((xn, i) => [mapX(xn), sceneYs[i]]);
  const songPts:  [number, number][] = XN.map((xn, i) => [mapX(xn), songYs[i]]);

  const scenePath = catmullPath(scenePts);
  const songPath  = catmullPath(songPts);
  const regions   = divergenceRegions(sceneYs, songYs);

  // Turn marker at x = 3/4 (where Turn phase maps in expanded arc, index 6)
  const turnX      = mapX(3 / 4);

  // Climax: where scene arc peaks in expanded coords
  const climaxExpandedIdx = [1, 2, 4, 6][scenePhases.indexOf(Math.max(...scenePhases))] ?? 6;
  const climaxX    = scenePts[climaxExpandedIdx][0];
  const climaxY    = scenePts[climaxExpandedIdx][1];

  // Release marker at x = 7/8
  const releaseX   = mapX(7 / 8);

  const matchColor = arcMatch
    ? arcMatch.combinedScore >= 75 ? C.good
      : arcMatch.combinedScore >= 50 ? C.amber
      : C.lavender
    : C.lavender;

  const durLabel = sceneLengthSec != null
    ? `${Math.floor(sceneLengthSec / 60)}:${String(Math.floor(sceneLengthSec % 60)).padStart(2, '0')}`
    : null;

  return (
    <div style={{
      borderRadius: 16,
      background: C.bg,
      border: `1px solid ${C.hairline}`,
      padding: '18px 20px 14px',
      overflow: 'hidden',
    }}>
      {/* ── header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="22" height="4" style={{ flexShrink: 0 }}>
              <line x1="0" y1="2" x2="22" y2="2" stroke={C.magenta} strokeWidth="2.5" strokeDasharray="6,4" />
            </svg>
            <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavender, fontFamily: SANS }}>Scene arc</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="22" height="4" style={{ flexShrink: 0 }}>
              <line x1="0" y1="2" x2="22" y2="2" stroke={C.amber} strokeWidth="2.5" />
            </svg>
            <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.lavender, fontFamily: SANS }}>Song arc</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Divergence legend */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {[
              { color: C.aligned,  border: 'rgba(76,175,130,0.55)',  label: 'Aligned' },
              { color: C.drift,    border: 'rgba(245,181,68,0.55)',   label: 'Drifting' },
              { color: C.diverge,  border: 'rgba(232,90,90,0.55)',    label: 'Diverging' },
            ].map(({ color, border, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: color, border: `1px solid ${border}` }} />
                <span style={{ fontSize: 8.5, color: 'rgba(155,147,196,0.55)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: SANS }}>{label}</span>
              </div>
            ))}
          </div>
          {arcMatch && (
            <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: matchColor, letterSpacing: '0.02em' }}>
              {arcMatch.combinedScore} fit
            </span>
          )}
        </div>
      </div>

      {/* ── SVG canvas ── */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
        aria-label="Narrative arc canvas: scene arc versus song arc"
      >
        <defs>
          <clipPath id="canvas-clip">
            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>

        {/* Grid lines at 25 / 50 / 75 */}
        {[25, 50, 75].map(v => (
          <g key={v}>
            <line x1={PAD_L} y1={mapY(v)} x2={W - PAD_R} y2={mapY(v)}
              stroke="rgba(123,112,178,0.09)" strokeWidth="1" />
            <text x={PAD_L - 5} y={mapY(v) + 4} textAnchor="end" fontSize="8"
              fill="rgba(123,112,178,0.32)" fontFamily={MONO}>{v}</text>
          </g>
        ))}

        {/* Divergence region fills */}
        <g clipPath="url(#canvas-clip)">
          {regions.map((r, i) => (
            <polygon
              key={i}
              points={`${r.x1},${r.sy1} ${r.x2},${r.sy2} ${r.x2},${r.ny2} ${r.x1},${r.ny1}`}
              fill={regionFill(r.delta)}
              stroke="none"
            />
          ))}
        </g>

        {/* Turn marker — vertical line at the Turn phase */}
        <line x1={turnX} y1={PAD_T - 2} x2={turnX} y2={H - PAD_B}
          stroke="rgba(219,39,119,0.30)" strokeWidth="1" strokeDasharray="3,4" />
        <text x={turnX} y={PAD_T - 9} textAnchor="middle"
          fontSize="7.5" fill={C.magenta} fontFamily={SANS} letterSpacing="0.15em">
          TURN
        </text>

        {/* Release marker */}
        <line x1={releaseX} y1={PAD_T - 2} x2={releaseX} y2={H - PAD_B}
          stroke="rgba(245,181,68,0.22)" strokeWidth="1" strokeDasharray="2,5" />
        <text x={releaseX} y={PAD_T - 9} textAnchor="middle"
          fontSize="7.5" fill={C.amber} fontFamily={SANS} letterSpacing="0.12em">
          RELEASE
        </text>

        {/* Song arc — amber, solid */}
        <path d={songPath} fill="none" stroke={C.amber} strokeWidth="2.5" strokeLinecap="round" />

        {/* Scene arc — magenta, dashed */}
        <path d={scenePath} fill="none" stroke={C.magenta} strokeWidth="2.5"
          strokeDasharray="7,5" strokeLinecap="round" />

        {/* Climax marker on scene arc */}
        <circle cx={climaxX} cy={climaxY} r="7" fill={C.magenta} fillOpacity="0.12" />
        <circle cx={climaxX} cy={climaxY} r="3.5" fill={C.magenta} />
        <text x={climaxX} y={climaxY - 11} textAnchor="middle"
          fontSize="7.5" fill={C.magenta} fontFamily={SANS} letterSpacing="0.14em">
          CLIMAX
        </text>

        {/* Control-point dots */}
        {scenePts.map(([x, y], i) => (
          <circle key={`s${i}`} cx={x} cy={y} r="2.5" fill={C.magenta} fillOpacity="0.55" />
        ))}
        {songPts.map(([x, y], i) => (
          <circle key={`n${i}`} cx={x} cy={y} r="2.5" fill={C.amber} fillOpacity="0.55" />
        ))}

        {/* X-axis phase labels */}
        {[
          { xn: 0,     label: 'Opening',     anchor: 'start' as const },
          { xn: 1 / 2, label: 'Held Breath', anchor: 'middle' as const },
          { xn: 3 / 4, label: 'Turn',        anchor: 'middle' as const },
          { xn: 1,     label: 'Release',     anchor: 'end' as const },
        ].map(({ xn, label, anchor }) => (
          <text key={label} x={mapX(xn)} y={H - PAD_B + 16}
            textAnchor={anchor} fontSize="9" fill="rgba(123,112,178,0.42)"
            fontFamily={SANS} letterSpacing="0.08em">
            {label}
          </text>
        ))}

        {/* Normalized duration scale */}
        {durLabel && (
          <text x={W - PAD_R} y={H - PAD_B + 16}
            textAnchor="end" fontSize="8" fill="rgba(155,147,196,0.28)" fontFamily={MONO}>
            {durLabel}
          </text>
        )}
      </svg>

      <p style={{
        margin: '6px 0 0', fontFamily: SERIF, fontStyle: 'italic', fontSize: 11,
        color: 'rgba(123,112,178,0.38)', textAlign: 'center',
      }}>
        Dashed = scene emotional arc &nbsp;·&nbsp; Solid = song emotional arc &nbsp;·&nbsp; Colored regions show where they align or diverge
      </p>
    </div>
  );
}
