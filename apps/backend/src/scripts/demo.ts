/**
 * demo.ts — direct analysis path for recordings and demos.
 *
 * Usage:
 *   npm run demo -- ./audio/WhereWeBelong.wav
 *   npm run demo -- /absolute/path/to/track.wav
 *
 * No queue. No DB. Worker → score → narrative → stdout.
 * Exits non-zero on any failure so CI can catch regressions.
 */

import { execSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, realpathSync } from "fs";
import { basename, resolve } from "path";

import { calculateConfidenceScore } from "../scoring/confidenceScore";
import { computeRightsState } from "../scoring/rightsStateMachine";
import { BRIEF_WEIGHTS } from "../scoring/briefWeights";
import { computeSyncVisionScoreV2 } from "../scoring/scoringV2";
import { NARRATIVE_DICTIONARY } from "../scoring/narratives";
import type { Verdict } from "../scoring/narratives";

// ── Python worker ─────────────────────────────────────────────────────────────

const PYTHON = (() => {
  for (const p of [
    "/opt/homebrew/opt/python@3.11/bin/python3.11",
    "/opt/homebrew/bin/python3.11",
    "/usr/local/bin/python3.11",
    "/usr/bin/python3",
  ]) {
    if (existsSync(p)) return p;
  }
  return "python3";
})();

// Resolve worker relative to this source file, handling both tsx (source)
// and compiled (dist/) execution paths.
const WORKER = (() => {
  // Walk up from wherever this file lives until we find apps/worker/analyze.py
  const candidates = [
    resolve(__dirname, "../../../../worker/analyze.py"),            // compiled: dist/scripts/
    resolve(__dirname, "../../../worker/analyze.py"),               // tsx: src/scripts/ relative to apps/
    resolve(__dirname, "../../../../../../apps/worker/analyze.py"), // monorepo fallback
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Absolute fallback based on known monorepo layout
  return resolve(__dirname, "../../../../apps/worker/analyze.py");
})();

// ── Brief definitions (PAD targets) ──────────────────────────────────────────

type Range = [number, number];
interface PADRange { valence: Range; arousal: Range; dominance: Range }

const BRIEFS: Record<string, { label: string; pad: PADRange }> = {
  "chase-tension":            { label: "Chase / Tension",            pad: { arousal: [0.75, 1.00], valence: [0.30, 0.60], dominance: [0.70, 1.00] } },
  "action-combat":            { label: "Action / Combat",            pad: { arousal: [0.80, 1.00], valence: [0.20, 0.45], dominance: [0.80, 1.00] } },
  "triumph-victory":          { label: "Triumph / Victory",          pad: { arousal: [0.80, 1.00], valence: [0.85, 1.00], dominance: [0.65, 1.00] } },
  "euphoria-celebration":     { label: "Euphoria / Celebration",     pad: { arousal: [0.80, 1.00], valence: [0.85, 1.00], dominance: [0.65, 1.00] } },
  "suspense-dread":           { label: "Suspense / Dread",           pad: { arousal: [0.60, 0.80], valence: [0.10, 0.35], dominance: [0.30, 0.55] } },
  "horror-psychological":     { label: "Horror / Psychological",     pad: { arousal: [0.50, 0.70], valence: [0.05, 0.25], dominance: [0.20, 0.40] } },
  "drama-confrontation":      { label: "Drama / Confrontation",      pad: { arousal: [0.60, 0.75], valence: [0.25, 0.45], dominance: [0.55, 0.70] } },
  "urban-gritty":             { label: "Urban / Gritty",             pad: { arousal: [0.60, 0.75], valence: [0.30, 0.50], dominance: [0.65, 0.80] } },
  "romance-intimacy":         { label: "Romance / Intimacy",         pad: { arousal: [0.20, 0.40], valence: [0.70, 1.00], dominance: [0.20, 0.40] } },
  "heartbreak-separation":    { label: "Heartbreak / Separation",    pad: { arousal: [0.25, 0.45], valence: [0.15, 0.35], dominance: [0.15, 0.30] } },
  "grief-loss":               { label: "Grief / Loss",               pad: { arousal: [0.15, 0.35], valence: [0.20, 0.40], dominance: [0.15, 0.30] } },
  "contemplative-reflective": { label: "Contemplative / Reflective", pad: { arousal: [0.15, 0.35], valence: [0.40, 0.60], dominance: [0.20, 0.35] } },
  "emotional-resolution":     { label: "Emotional Resolution",       pad: { arousal: [0.40, 0.60], valence: [0.60, 0.80], dominance: [0.45, 0.65] } },
  "comedy-light":             { label: "Comedy / Light",             pad: { arousal: [0.45, 0.65], valence: [0.75, 1.00], dominance: [0.40, 0.60] } },
  "quirky-offbeat":           { label: "Quirky / Offbeat",           pad: { arousal: [0.40, 0.60], valence: [0.60, 0.80], dominance: [0.35, 0.55] } },
  "montage-transition":       { label: "Montage / Transition",       pad: { arousal: [0.40, 0.60], valence: [0.40, 0.60], dominance: [0.40, 0.60] } },
  "opening-closing-title":    { label: "Opening / Closing Title",    pad: { arousal: [0.50, 0.70], valence: [0.50, 0.70], dominance: [0.55, 0.75] } },
  "cinematic-epic":           { label: "Cinematic / Epic",           pad: { arousal: [0.65, 0.80], valence: [0.45, 0.65], dominance: [0.75, 1.00] } },
  "corporate-aspirational":   { label: "Corporate / Aspirational",   pad: { arousal: [0.50, 0.65], valence: [0.70, 0.85], dominance: [0.60, 0.75] } },
  "nature-pastoral":          { label: "Nature / Pastoral",          pad: { arousal: [0.15, 0.40], valence: [0.55, 0.75], dominance: [0.20, 0.40] } },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function distFromRange(v: number, [lo, hi]: Range): number {
  if (v < lo) return lo - v;
  if (v > hi) return v - hi;
  return 0;
}

const MAX_PAD_DIST = Math.sqrt(3);

function sceneFitForBrief(
  vMean: number, aMean: number, dMean: number,
  brief: PADRange
): number {
  const dV = distFromRange(vMean, brief.valence);
  const dA = distFromRange(aMean, brief.arousal);
  const dD = distFromRange(dMean, brief.dominance);
  const dist = Math.sqrt(dV * dV + dA * dA + dD * dD);
  return Math.round((1 - Math.min(1, dist / MAX_PAD_DIST)) * 100);
}

function verdictFor(sceneFit: number): Verdict {
  if (sceneFit >= 80) return "PASS_STRONG";
  if (sceneFit >= 70) return "PASS_SOFT";
  if (sceneFit >= 60) return "MAYBE_HIGH";
  if (sceneFit >= 50) return "MAYBE_LOW";
  if (sceneFit >= 40) return "FAIL_CLOSE";
  return "FAIL_HARD";
}

function pickPhrase(pool: [string, string, string, string], trackHash: string, briefId: string, verdict: Verdict): string {
  const h = createHash("sha256").update(`${trackHash}:${briefId}:${verdict}`).digest("hex");
  return pool[parseInt(h.slice(0, 8), 16) % pool.length];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const rawArg = process.argv[2];
  if (!rawArg) {
    console.error("Usage: npm run demo -- <path-to-audio-file>");
    process.exit(1);
  }

  const audioPath = resolve(process.cwd(), rawArg);
  if (!existsSync(audioPath)) {
    console.error(`File not found: ${audioPath}`);
    process.exit(1);
  }

  const filename = basename(audioPath);

  // ── 1. Run Python worker ─────────────────────────────────────────────────
  process.stderr.write("Running audio analysis… ");
  const t0 = Date.now();
  let raw: string;
  try {
    raw = execSync(`"${PYTHON}" "${WORKER}" "${audioPath}"`, {
      maxBuffer: 64 * 1024 * 1024,
    }).toString();
  } catch (e) {
    console.error(`\nWorker failed: ${(e as Error).message}`);
    process.exit(1);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  process.stderr.write(`done (${elapsed}s)\n`);

  interface WorkerResult {
    durationSeconds: number;
    tempo: number;
    tonalCharacter: string;
    energyCharacter: string;
    valenceMean: number;
    arousalMean: number;
    dominanceMean: number;
    modelVersion: string;
    inputHash: string;
    timeline: number[][];
    spectralCentroid: number;
    rmsEnergy: number;
    zeroCrossingRate: number;
  }

  const analysis: WorkerResult = JSON.parse(raw);

  // ── 2. Find best-matching brief ───────────────────────────────────────────
  let bestBriefId = "";
  let bestSceneFit = -1;
  let bestMatchScore = -1;

  for (const [briefId, brief] of Object.entries(BRIEFS)) {
    const sf = sceneFitForBrief(
      analysis.valenceMean, analysis.arousalMean, analysis.dominanceMean,
      brief.pad
    );
    const weights = BRIEF_WEIGHTS[briefId];
    // For demo: use neutral rights/meta (no DB lookup) — focus is DSP fit
    const score = parseFloat((sf * weights.sceneFit + 75 * weights.rightsClarity + 85 * weights.metadata).toFixed(1));
    if (sf > bestSceneFit || (sf === bestSceneFit && score > bestMatchScore)) {
      bestBriefId = briefId;
      bestSceneFit = sf;
      bestMatchScore = score;
    }
  }

  const brief = BRIEFS[bestBriefId];
  const weights = BRIEF_WEIGHTS[bestBriefId];
  const verdict = verdictFor(bestSceneFit);

  // ── 3. Confidence score (v1, no DB) ──────────────────────────────────────
  const fakeTrack = {
    isrc: null,
    title: filename,
    tempo: analysis.tempo,
    tonalCharacter: analysis.tonalCharacter,
    energyCharacter: analysis.energyCharacter,
    spectralCentroid: analysis.spectralCentroid,
    rmsEnergy: analysis.rmsEnergy,
    timeline: analysis.timeline,
  };
  // No rights data for a fresh file — show realistic confidence
  const conf = calculateConfidenceScore(fakeTrack, {});

  // ── 4. SyncVision Score v2 ────────────────────────────────────────────────
  const rightsState = computeRightsState(null); // no DB — INGESTED
  const v2 = computeSyncVisionScoreV2(
    bestBriefId,
    { sceneFit: bestSceneFit, rightsClarity: 0, metadata: conf.breakdown.metadataCompleteness },
    weights,
    rightsState,
    analysis.modelVersion,
  );

  // ── 5. Narrative ──────────────────────────────────────────────────────────
  const pool = NARRATIVE_DICTIONARY[bestBriefId];
  const basePhrase = pool ? pickPhrase(pool[verdict], analysis.inputHash, bestBriefId, verdict) : "(no narrative)";
  const dspSuffix = `(${analysis.tonalCharacter}, ${analysis.energyCharacter}, ${Math.round(analysis.tempo)} BPM)`;
  const narrative = `${basePhrase} ${dspSuffix}`;

  // ── 6. Output ─────────────────────────────────────────────────────────────
  const col = 12;
  const lbl = (s: string) => s.padEnd(col);
  const lines = [
    "",
    `${lbl("INPUT:")}${filename}`,
    `${lbl("DSP:")}tempo=${Math.round(analysis.tempo)} tonal=${analysis.tonalCharacter} energy=${analysis.energyCharacter} duration=${formatDuration(analysis.durationSeconds)}`,
    `${lbl("ANALYSIS:")}valence=${analysis.valenceMean.toFixed(2)} arousal=${analysis.arousalMean.toFixed(2)} dominance=${analysis.dominanceMean.toFixed(2)}`,
    `${lbl("BRIEF:")}${brief.label} → ${verdict.replace("_", " ")} (sceneFit: ${bestSceneFit})`,
    `${lbl("NARRATIVE:")}${narrative}`,
    `${lbl("HASH:")}${v2.inputHash.slice(0, 32)}… modelVersion=${analysis.modelVersion}`,
    "",
  ];
  console.log(lines.join("\n"));
}

main();
