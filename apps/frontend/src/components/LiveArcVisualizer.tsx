import { useEffect, useRef } from 'react';
import type { SceneArc, ArcMatchResult } from '../utils/apiClient';
import { getAnalyser } from '../engine/audioAnalyser';

/**
 * The hero. The Story Match arc, drawn on a canvas that reacts to the real
 * audio in real time: as the track plays, a playhead traces both curves and a
 * live frequency ribbon + pulsing glow ride the music. Falls back to a clean
 * static render when paused or when Web Audio isn't available.
 */

const MAGENTA = '#DB2777';
const AMBER   = '#F5B544';
const LAV     = 'rgba(155,147,196,0.55)';
const GOOD    = '#4CAF82';
const SANS    = '"Manrope", system-ui, sans-serif';
const SERIF   = '"Instrument Serif", Georgia, serif';
const MONO    = '"JetBrains Mono", monospace';

const PHASE_LABELS = ['Opening', 'Held Breath', 'Turn', 'Release'];

type Props = {
  sceneArc: SceneArc;
  songArcCurve: number[];        // 0–100 × 4
  arcMatch: ArcMatchResult;
  /** The live <audio> element (from the player). */
  audioEl: HTMLAudioElement | null;
  isPlaying: boolean;
  /** currentTime / duration — drives the playhead when paused. */
  fraction: number;
  measured?: boolean;
};

// Catmull-Rom → cubic bezier, matching ArcMatchGraph so the shape reads identically.
function strokeSmooth(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  const tension = 0.35;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
  }
  ctx.stroke();
}

// Y on a piecewise segment for the playhead dot (linear between phase points).
function interpY(ys: number[], frac: number): number {
  const seg = frac * 3;
  const i = Math.min(Math.floor(seg), 2);
  const t = seg - i;
  return ys[i] + (ys[i + 1] - ys[i]) * t;
}

export function LiveArcVisualizer({ sceneArc, songArcCurve, arcMatch, audioEl, isPlaying, fraction, measured }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef    = useRef<number | null>(null);

  // Latest props for the animation loop, without restarting it each render.
  const stateRef = useRef({ sceneArc, songArcCurve, arcMatch, audioEl, isPlaying, fraction });
  stateRef.current = { sceneArc, songArcCurve, arcMatch, audioEl, isPlaying, fraction };

  const matchColor = arcMatch.combinedScore >= 75 ? GOOD : arcMatch.combinedScore >= 50 ? AMBER : LAV;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const freq = new Uint8Array(128);

    const render = () => {
      const s = stateRef.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth || 320;
      const cssH = canvas.clientHeight || 150;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const padL = 10, padR = 10, padT = 12, padB = 22;
      const plotW = cssW - padL - padR;
      const plotH = cssH - padT - padB;
      const mapX = (i: number) => padL + (i / 3) * plotW;
      const mapY = (v: number) => padT + plotH * (1 - Math.max(0, Math.min(100, v)) / 100);

      const sceneYs = [sceneArc.opening, sceneArc.heldBreath, sceneArc.turn, sceneArc.release].map(mapY);
      const songYs  = s.songArcCurve.slice(0, 4).map(mapY);
      const scenePts = sceneYs.map((y, i) => [mapX(i), y] as [number, number]);
      const songPts  = songYs.map((y, i) => [mapX(i), y] as [number, number]);

      // ── live audio level + spectrum ──
      let level = 0;
      let analyser: AnalyserNode | null = null;
      if (s.isPlaying && s.audioEl) {
        analyser = getAnalyser(s.audioEl);
        if (analyser) {
          analyser.getByteFrequencyData(freq);
          let sum = 0;
          for (let i = 0; i < freq.length; i++) sum += freq[i];
          level = Math.min(1, (sum / freq.length) / 160); // 0..1 energy
        }
      }

      // grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(123,112,178,0.10)';
      for (const v of [25, 50, 75]) {
        ctx.beginPath(); ctx.moveTo(padL, mapY(v)); ctx.lineTo(cssW - padR, mapY(v)); ctx.stroke();
      }

      // live frequency ribbon along the baseline (only while playing)
      if (analyser) {
        const bars = 48;
        const bw = plotW / bars;
        for (let i = 0; i < bars; i++) {
          const fi = Math.floor((i / bars) * freq.length);
          const h = (freq[fi] / 255) * (plotH * 0.55);
          const x = padL + i * bw;
          const y = padT + plotH - h;
          const g = ctx.createLinearGradient(0, y, 0, padT + plotH);
          g.addColorStop(0, 'rgba(219,39,119,0.42)');
          g.addColorStop(1, 'rgba(245,181,68,0.05)');
          ctx.fillStyle = g;
          ctx.fillRect(x, y, Math.max(1, bw - 1), h);
        }
      }

      // gap fill between curves
      ctx.beginPath();
      ctx.moveTo(scenePts[0][0], scenePts[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(scenePts[i][0], scenePts[i][1]);
      for (let i = 3; i >= 0; i--) ctx.lineTo(songPts[i][0], songPts[i][1]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(219,39,119,0.06)';
      ctx.fill();

      // track arc — amber solid, glows with live level
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 2 + level * 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(245,181,68,0.6)';
      ctx.shadowBlur = level * 16;
      strokeSmooth(ctx, songPts);
      ctx.shadowBlur = 0;

      // scene arc — magenta dashed
      ctx.strokeStyle = MAGENTA;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      strokeSmooth(ctx, scenePts);
      ctx.setLineDash([]);

      // phase dots
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = MAGENTA; ctx.beginPath(); ctx.arc(scenePts[i][0], scenePts[i][1], 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = AMBER;   ctx.beginPath(); ctx.arc(songPts[i][0], songPts[i][1], 3, 0, Math.PI * 2); ctx.fill();
      }

      // ── playhead ──
      const frac = s.isPlaying && s.audioEl && s.audioEl.duration > 0
        ? s.audioEl.currentTime / s.audioEl.duration
        : s.fraction;
      if (frac > 0 && frac <= 1) {
        const px = padL + frac * plotW;
        const songY = interpY(songYs, frac);
        const sceneY = interpY(sceneYs, frac);
        // vertical sweep line
        ctx.strokeStyle = 'rgba(245,181,68,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, padT + plotH); ctx.stroke();
        // pulsing glow on the track dot, driven by live level
        const r = 4 + level * 7;
        const glow = ctx.createRadialGradient(px, songY, 0, px, songY, r * 2.4);
        glow.addColorStop(0, `rgba(245,181,68,${0.5 + level * 0.4})`);
        glow.addColorStop(1, 'rgba(245,181,68,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(px, songY, r * 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = AMBER;   ctx.beginPath(); ctx.arc(px, songY, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = MAGENTA; ctx.beginPath(); ctx.arc(px, sceneY, 3.5, 0, Math.PI * 2); ctx.fill();
      }

      // phase labels
      ctx.fillStyle = 'rgba(123,112,178,0.5)';
      ctx.font = `700 8px ${SANS}`;
      ctx.textBaseline = 'alphabetic';
      for (let i = 0; i < 4; i++) {
        ctx.textAlign = i === 0 ? 'left' : i === 3 ? 'right' : 'center';
        ctx.fillText(PHASE_LABELS[i].toUpperCase(), mapX(i), cssH - 6);
      }

      if (stateRef.current.isPlaying) {
        rafRef.current = requestAnimationFrame(render);
      } else {
        rafRef.current = null;
      }
    };

    // Kick a render. While playing it self-schedules; when paused it draws once.
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(render);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
    // Re-run when playback toggles or the arc/track changes; the loop reads the
    // rest live from stateRef.
  }, [isPlaying, audioEl, sceneArc, songArcCurve, fraction]);

  return (
    <div style={{ padding: '12px 14px 10px', borderRadius: 14, background: 'rgba(7,4,26,0.55)', border: '1px solid rgba(123,112,178,0.16)', marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 18, height: 1, background: `linear-gradient(90deg,${MAGENTA},transparent)`, display: 'inline-block' }} />
          <span style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#9B93C4' }}>Story Match</span>
          {isPlaying && <span style={{ fontSize: 9, color: GOOD, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>● live</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: '#9B93C4' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="18" height="3"><line x1="0" y1="1.5" x2="18" y2="1.5" stroke={MAGENTA} strokeWidth="2" strokeDasharray="4,2" /></svg>Scene
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="18" height="3"><line x1="0" y1="1.5" x2="18" y2="1.5" stroke={AMBER} strokeWidth="2" /></svg>Track
          </span>
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 150 }} aria-label="Live Story Match arc visualizer" />

      <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(123,112,178,0.16)' }}>
        <Metric label="Shape"   value={arcMatch.magnitudeScore} color={LAV} />
        <div style={{ width: 1, background: 'rgba(123,112,178,0.16)', alignSelf: 'stretch' }} />
        <Metric label="Valence" value={arcMatch.valenceScore}   color={LAV} />
        <div style={{ width: 1, background: 'rgba(123,112,178,0.16)', alignSelf: 'stretch' }} />
        <Metric label="Match"   value={arcMatch.combinedScore}  color={matchColor} />
      </div>

      <p style={{ margin: '8px 0 0', fontFamily: SERIF, fontStyle: 'italic', fontSize: 11, color: 'rgba(123,112,178,0.5)', textAlign: 'center' }}>
        {isPlaying
          ? 'Playhead + spectrum ride the live audio — watch the track arc breathe against the scene.'
          : measured
            ? 'Press play — the arc reacts to the real signal, phase by phase.'
            : 'Dashed = scene arc · Solid = track arc · Closer curves = stronger match'}
      </p>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9B93C4', lineHeight: 1 }}>{label}</span>
    </div>
  );
}
