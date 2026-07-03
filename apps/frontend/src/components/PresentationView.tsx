/**
 * PresentationView — the Forensic Adjudication Terminal's pitch deck.
 *
 * Brutalist Data-Pitch aesthetic:
 *   - absolute black / neutral-950 surfaces, 1px neutral-800 grid borders
 *   - no blur, no glow, no gradients, corners rounded-sm at most
 *   - data readouts: font-mono tabular-nums; verdicts font-black (900)
 *   - labels: uppercase tracking-wider sans
 *
 * The physics layer renders the actual DSP forensic arrays (Sub-Zero, CMAM,
 * Zero-Pocket, High-Fidelity Air) — not a smoothed "emotional trajectory".
 * The key transient marker (e.g. the door slam) aligns with the real spike in
 * the High-Fidelity Air lane, and dialogue-pocket collisions are computed
 * frame-by-frame with the same thresholds as the backend adjudicator.
 */

import type {
  ForensicTimeline,
  PresentationPayload,
} from '../types/forensic';

// ── Backend-mirrored constants (dnaAdjudication.ts DEFAULT_ZERO_POCKET_OPTIONS)
const DIP_THRESHOLD = 0.2;
const VIOLATION_THRESHOLD = 0.6;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Downsample by per-bin MAX — preserves transient spikes. */
function binMax(arr: readonly number[], bins: number): number[] {
  const out = new Array<number>(bins).fill(0);
  if (arr.length === 0) return out;
  for (let b = 0; b < bins; b++) {
    const from = Math.floor((b / bins) * arr.length);
    const to = Math.max(from + 1, Math.floor(((b + 1) / bins) * arr.length));
    let mx = 0;
    for (let i = from; i < to; i++) if (arr[i] > mx) mx = arr[i];
    out[b] = mx;
  }
  return out;
}

/** Downsample by per-bin MEAN — smooth envelopes. */
function binMean(arr: readonly number[], bins: number): number[] {
  const out = new Array<number>(bins).fill(0);
  if (arr.length === 0) return out;
  for (let b = 0; b < bins; b++) {
    const from = Math.floor((b / bins) * arr.length);
    const to = Math.max(from + 1, Math.floor(((b + 1) / bins) * arr.length));
    let s = 0;
    for (let i = from; i < to; i++) s += arr[i];
    out[b] = s / (to - from);
  }
  return out;
}

function money(usd: number): string {
  return `$${usd.toLocaleString('en-US')}`;
}

function pct(sec: number, duration: number): number {
  return Math.max(0, Math.min(100, (sec / duration) * 100));
}

/** Frame ranges where temp dips and the (lag-aligned) proposed track is loud. */
function collisionRanges(
  temp: readonly number[],
  proposed: readonly number[],
  lagFrames: number,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i < temp.length; i++) {
    const j = i - lagFrames;
    const collides =
      temp[i] < DIP_THRESHOLD &&
      j >= 0 && j < proposed.length &&
      proposed[j] > VIOLATION_THRESHOLD;
    if (collides && start === -1) start = i;
    if (!collides && start !== -1) { ranges.push([start, i]); start = -1; }
  }
  if (start !== -1) ranges.push([start, temp.length]);
  return ranges;
}

/** Contiguous dip windows in the temp pocket band (dialogue room). */
function dipRanges(temp: readonly number[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i < temp.length; i++) {
    const dip = temp[i] < DIP_THRESHOLD;
    if (dip && start === -1) start = i;
    if (!dip && start !== -1) { ranges.push([start, i]); start = -1; }
  }
  if (start !== -1) ranges.push([start, temp.length]);
  return ranges;
}

// ── Lane primitives (raw SVG, no gradients) ───────────────────────────────────

const VB_W = 1000;
const VB_H = 100;
const BINS = 160;

function BarLane({ data, fill }: { data: number[]; fill: string }) {
  const w = VB_W / data.length;
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      className="w-full h-full block"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {data.map((v, i) =>
        v > 0.005 ? (
          <rect
            key={i}
            x={i * w}
            y={VB_H - v * VB_H}
            width={Math.max(1, w - 1)}
            height={v * VB_H}
            className={fill}
          />
        ) : null,
      )}
    </svg>
  );
}

function LineLane({
  series,
}: {
  series: Array<{ data: number[]; stroke: string }>;
}) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      className="w-full h-full block"
      aria-hidden
    >
      {series.map((s, k) => {
        const step = VB_W / Math.max(1, s.data.length - 1);
        const d = s.data
          .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(VB_H - v * VB_H).toFixed(1)}`)
          .join(' ');
        return (
          <path
            key={k}
            d={d}
            className={s.stroke}
            fill="none"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function LaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-2 top-1 z-10 text-[9px] uppercase tracking-wider text-neutral-500 font-sans pointer-events-none">
      {children}
    </div>
  );
}

// ── Verdict cell ──────────────────────────────────────────────────────────────

function VerdictCell({
  label,
  value,
  sub,
  accent = false,
  alarm = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  alarm?: boolean;
}) {
  return (
    <div className="bg-black p-5">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-sans">
        {label}
      </div>
      <div
        className={`mt-2 text-3xl font-black font-mono tabular-nums leading-none ${
          alarm ? 'text-red-500' : accent ? 'text-cyan-400' : 'text-white'
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-2 text-[10px] font-mono tabular-nums text-neutral-500">
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function PresentationView({ payload }: { payload: PresentationPayload }) {
  const { temp, proposed, verdict, durationSeconds } = payload;
  const t: ForensicTimeline = temp.timeline;
  const p: ForensicTimeline = proposed.timeline;

  const airBins = binMax(p.highFidelityAir, BINS);
  const subBins = binMax(p.subZero, BINS);
  const pocketPropBins = binMean(p.zeroPocketZone, BINS);
  const pocketTempLine = binMean(t.zeroPocketZone, BINS);
  const cmamProp = binMean(p.cmamTension, BINS);
  const cmamTemp = binMean(t.cmamTension, BINS);

  const collisions = collisionRanges(
    t.zeroPocketZone,
    p.zeroPocketZone,
    verdict.offset.lagFrames,
  );
  const dips = dipRanges(t.zeroPocketZone);
  const nFrames = t.zeroPocketZone.length;

  const offsetSign = verdict.dropFrameOffsetSec >= 0 ? '+' : '−';
  const offsetAbs = Math.abs(verdict.dropFrameOffsetSec).toFixed(4);

  return (
    <div className="min-h-screen bg-black text-white font-sans p-6 md:p-10">
      <div className="max-w-6xl mx-auto">

        {/* ── header strip ── */}
        <div className="flex items-baseline justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-baseline gap-4">
            <span className="text-sm font-black tracking-tight">SYNCVISION</span>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
              Forensic Adjudication Terminal · Pitch Packet
            </span>
          </div>
          <div className="flex items-center gap-3">
            {payload.isFixture && (
              <span className="text-[10px] uppercase tracking-wider font-mono text-amber-400 border border-amber-400/60 px-2 py-0.5 rounded-sm">
                Demo fixture
              </span>
            )}
            <span className="text-[10px] font-mono tabular-nums text-neutral-500">
              {payload.sceneLabel} · {durationSeconds}s · {payload.cutPointsSec.length} cuts
            </span>
          </div>
        </div>

        {/* ── MATRIX A: the verdict ── */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-px bg-neutral-800 border border-neutral-800">
          <VerdictCell
            label="Match Score"
            value={verdict.matchScore.toFixed(4)}
            sub={`raw ${verdict.rawMatchScore.toFixed(4)} − pocket ${verdict.zeroPocket.penalty.toFixed(4)}`}
            accent
          />
          <VerdictCell
            label="Drop-Frame Offset"
            value={`t ${offsetSign}${offsetAbs}s`}
            sub={`${verdict.offset.lagFrames >= 0 ? '+' : ''}${verdict.offset.lagFrames} frames @ ${payload.fps}fps`}
          />
          <VerdictCell
            label="Divergence Guard"
            value={verdict.divergence.toFixed(4)}
            sub="10-90 rule · infringement buffer"
          />
          <VerdictCell
            label="Zero-Pocket Audit"
            value={
              verdict.zeroPocket.violatedFrameCount === 0
                ? 'CLEAR'
                : String(verdict.zeroPocket.violatedFrameCount)
            }
            sub={`${verdict.zeroPocket.dipFrameCount} dialogue frames checked`}
            alarm={verdict.zeroPocket.violatedFrameCount > 0}
          />
        </div>

        {/* ── A/B bypass strip ── */}
        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] gap-px bg-neutral-800 border border-neutral-800">
          <div className="bg-neutral-950 p-4">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">
              A · Temp reference
            </div>
            <div className="mt-1 font-mono text-sm text-white">{temp.label}</div>
            <div className="text-[11px] text-neutral-400">{temp.description}</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono tabular-nums text-sm text-neutral-400 line-through">
                {temp.estCostUsd != null ? `${money(temp.estCostUsd)}+` : 'N/A'}
              </span>
              <span className="text-[9px] uppercase tracking-wider font-mono text-red-500 border border-red-500/60 px-1.5 py-0.5 rounded-sm">
                Un-clearable
              </span>
            </div>
          </div>
          <div className="bg-black px-4 flex items-center">
            <span className="font-mono text-neutral-500 text-lg" aria-hidden>→</span>
          </div>
          <div className="bg-neutral-950 p-4">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">
              B · Adjudicated mirror
            </div>
            <div className="mt-1 font-mono text-sm text-white">
              {proposed.title} — {proposed.artist}
            </div>
            <div className="text-[11px] text-neutral-400">
              band corr: sub {verdict.offset.bandCorrelations.subZero.toFixed(4)} ·
              cmam {verdict.offset.bandCorrelations.cmamTension.toFixed(4)} ·
              air {verdict.offset.bandCorrelations.highFidelityAir.toFixed(4)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono tabular-nums text-sm font-black text-cyan-400">
                {money(proposed.clearanceCostUsd)}
              </span>
              {proposed.oneStopCleared && (
                <span className="text-[9px] uppercase tracking-wider font-mono text-emerald-400 border border-emerald-400/60 px-1.5 py-0.5 rounded-sm">
                  One-stop cleared
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── MATRIX B: DSP forensic timeline ── */}
        <div className="mt-6 bg-neutral-950 border border-neutral-800">
          <div className="flex items-baseline justify-between px-4 pt-3 pb-2 border-b border-neutral-800">
            <h3 className="text-[10px] uppercase tracking-wider text-neutral-400 font-sans m-0">
              DSP forensic timeline · proposed track · cyan = raw array data
            </h3>
            <span className="text-[10px] font-mono tabular-nums text-neutral-500">
              {nFrames} frames · {payload.fps} fps · phase-locked
            </span>
          </div>

          {/* shared-axis lane stack; markers span every lane */}
          <div className="relative">

            {/* director's cuts */}
            {payload.cutPointsSec.map((sec) => (
              <div
                key={sec}
                className="absolute top-0 bottom-6 w-px bg-neutral-700 z-10 pointer-events-none"
                style={{ left: `${pct(sec, durationSeconds)}%` }}
                aria-hidden
              />
            ))}

            {/* key transient marker — lands on the real Air-lane spike */}
            <div
              className="absolute top-0 bottom-6 w-px bg-red-500 z-20 pointer-events-none"
              style={{ left: `${pct(payload.keyTransient.timeSec, durationSeconds)}%` }}
              aria-hidden
            />
            <div
              className="absolute top-1 z-20 -translate-x-full pr-1 text-right pointer-events-none"
              style={{ left: `${pct(payload.keyTransient.timeSec, durationSeconds)}%` }}
            >
              <span className="text-[9px] uppercase tracking-wider font-mono text-red-500 whitespace-nowrap">
                {payload.keyTransient.label} @ {payload.keyTransient.timeSec.toFixed(2)}s
              </span>
            </div>

            {/* Lane 1: High-Fidelity Air — transients that dictate edit speed */}
            <div className="relative h-20 border-b border-neutral-800">
              <LaneLabel>High-Fidelity Air · 10–20 kHz · transients</LaneLabel>
              <BarLane data={airBins} fill="fill-cyan-500" />
            </div>

            {/* Lane 2: Zero-Pocket — dialogue windows + collision audit */}
            <div className="relative h-16 border-b border-neutral-800">
              <LaneLabel>
                Zero-Pocket · 300 Hz–3 kHz · line = temp dips · bars = proposed
              </LaneLabel>
              {/* temp dialogue windows */}
              {dips.map(([from, to]) => (
                <div
                  key={`d${from}`}
                  className="absolute top-0 bottom-0 bg-neutral-900 border-x border-neutral-700/50"
                  style={{
                    left: `${(from / nFrames) * 100}%`,
                    width: `${((to - from) / nFrames) * 100}%`,
                  }}
                  aria-hidden
                />
              ))}
              <div className="absolute inset-0">
                <BarLane data={pocketPropBins} fill="fill-cyan-800" />
              </div>
              <div className="absolute inset-0">
                <LineLane series={[{ data: pocketTempLine, stroke: 'stroke-neutral-400' }]} />
              </div>
              {/* phase collisions */}
              {collisions.map(([from, to]) => (
                <div
                  key={`c${from}`}
                  className="absolute top-0 bottom-0 bg-red-600/40 border-x border-red-500 z-10 flex items-center justify-center"
                  style={{
                    left: `${(from / nFrames) * 100}%`,
                    width: `${Math.max(0.4, ((to - from) / nFrames) * 100)}%`,
                  }}
                >
                  <span className="text-[8px] font-bold font-mono text-red-300 rotate-90 whitespace-nowrap">
                    PHASE COLLISION
                  </span>
                </div>
              ))}
              {collisions.length === 0 && (
                <div className="absolute right-2 bottom-1 z-10 text-[9px] font-mono uppercase tracking-wider text-emerald-400">
                  0 collisions
                </div>
              )}
            </div>

            {/* Lane 3: CMAM tension — temp (grey) vs proposed (cyan) */}
            <div className="relative h-24 border-b border-neutral-800">
              <LaneLabel>CMAM tension · chroma entropy · grey = temp / cyan = proposed</LaneLabel>
              <LineLane
                series={[
                  { data: cmamTemp, stroke: 'stroke-neutral-500' },
                  { data: cmamProp, stroke: 'stroke-cyan-500' },
                ]}
              />
            </div>

            {/* Lane 4: Sub-Zero — weight and impact */}
            <div className="relative h-14 border-b border-neutral-800">
              <LaneLabel>Sub-Zero · 20–80 Hz · impact weight</LaneLabel>
              <BarLane data={subBins} fill="fill-cyan-900" />
            </div>

            {/* time ruler */}
            <div className="relative h-6">
              {Array.from({ length: Math.floor(durationSeconds / 10) + 1 }, (_, i) => i * 10).map(
                (sec) => (
                  <span
                    key={sec}
                    className="absolute top-1 text-[9px] font-mono tabular-nums text-neutral-600"
                    style={{ left: `${pct(sec, durationSeconds)}%` }}
                  >
                    {sec}s
                  </span>
                ),
              )}
            </div>
          </div>
        </div>

        {/* ── deal closer + runners-up ── */}
        <div className="mt-6 grid md:grid-cols-[3fr_2fr] gap-px bg-neutral-800 border border-neutral-800">

          <div className="bg-neutral-950 p-5">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">
              The deal closer
            </div>
            <blockquote className="mt-3 m-0 font-mono text-sm leading-relaxed text-white border-l border-cyan-500 pl-4">
              "{payload.dealCloser.quote}"
            </blockquote>
            <div className="mt-3 text-[11px] font-mono tabular-nums text-neutral-400">
              {payload.dealCloser.supportLine}
            </div>
          </div>

          <div className="bg-neutral-950 p-5">
            <div className="flex items-baseline justify-between">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                Two more mirrors
              </div>
              <div className="text-[9px] uppercase tracking-wider text-neutral-600">
                Same DNA · ranked
              </div>
            </div>
            {payload.runnersUp.map((c) => (
              <div
                key={c.title}
                className="mt-3 pt-3 border-t border-neutral-800 first:mt-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs text-white">
                    {c.title} — {c.artist}
                  </span>
                  <span className="font-mono tabular-nums text-xs font-black text-cyan-400 whitespace-nowrap">
                    {c.matchScore.toFixed(4)} · {money(c.clearanceCostUsd)}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">{c.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── audit footer ── */}
        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2 border-t border-neutral-800 pt-3 text-[10px] font-mono tabular-nums text-neutral-600">
          <span>
            inputHash {payload.inputHash} · model {payload.modelVersion}
          </span>
          <span className="uppercase tracking-wider">
            Deterministic · reproducible bit-for-bit · no probabilistic inference
          </span>
        </div>
      </div>
    </div>
  );
}
