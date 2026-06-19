import type { SceneArc } from '../utils/apiClient';

const PAD = 2;

function mapY(val: number, h: number): number {
  return PAD + (h - 2 * PAD) * (1 - Math.max(0, Math.min(100, val)) / 100);
}
function mapX(i: number, w: number): number {
  return PAD + (i / 3) * (w - 2 * PAD);
}
function smoothPath(vals: number[], w: number, h: number): string {
  const pts = vals.map((v, i) => [mapX(i, w), mapY(v, h)] as [number, number]);
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

type Props = {
  curve: number[];
  sceneArc?: SceneArc | null;
  size?: { w: number; h: number };
};

export function ArcSparkline({ curve, sceneArc, size }: Props) {
  const w = size?.w ?? 56;
  const h = size?.h ?? 24;

  if (!curve || curve.length < 4) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <line x1={PAD} y1={h / 2} x2={w - PAD} y2={h / 2} stroke="rgba(123,112,178,0.2)" strokeWidth="1" strokeDasharray="2,2" />
      </svg>
    );
  }

  const songPath = smoothPath(curve.slice(0, 4), w, h);
  const scenePath = sceneArc
    ? smoothPath([sceneArc.opening, sceneArc.heldBreath, sceneArc.turn, sceneArc.release], w, h)
    : null;

  return (
    <svg
      width={w} height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {scenePath && (
        <path d={scenePath} fill="none" stroke="#DB2777" strokeWidth="1.5" strokeDasharray="3,2" strokeLinecap="round" />
      )}
      <path d={songPath} fill="none" stroke="#F5B544" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
