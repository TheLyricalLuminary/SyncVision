// Pilot analysis routes — wires the frontend's analysis flow to the real
// scoring pipeline (Python worker → PAD scene fit → rights → SyncVision v2).
//
//  POST /api/analysis/submit          - validate + kick off async processing
//  GET  /api/analysis/status/:jobId   - poll job state / results
//
// Job state is intentionally in-memory for the pilot (no Job model in Prisma).

import { Router, Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import prisma from "../lib/prisma";
import { computeRightsState } from "../scoring/rightsStateMachine";
import { enrichRightsProfile } from "../services/rightsEnrichment";
import { BRIEF_WEIGHTS } from "../scoring/briefWeights";
import { buildVector } from "../scoring/trackVector";
import { selectNarrativeWithLane, type PADValues } from "../scoring/narrativeDictionary";

const router = Router();

const AUDIO_DIR = path.resolve(__dirname, "../../audio");
const UPLOAD_DIR = process.env.AUDIO_STORAGE_PATH ?? AUDIO_DIR;
const WORKER_SCRIPT = path.resolve(__dirname, "../../../worker/analyze.py");
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";

// ─── Brief PAD ranges (mirrored from scores.ts / demo.ts) ────────────────────

type Range = [number, number];
interface PADRange { valence: Range; arousal: Range; dominance: Range }
interface BriefDef { label: string; pad: PADRange }

const BRIEFS: Record<string, BriefDef> = {
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

const MAX_PAD_DIST = Math.sqrt(3);

function distFromRange(value: number, [lo, hi]: Range): number {
  if (value < lo) return lo - value;
  if (value > hi) return value - hi;
  return 0;
}

interface PADMeans { valence: number; arousal: number; dominance: number }

function meanPAD(timeline: unknown): PADMeans | null {
  const rows = timeline as number[][] | null;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let v = 0, a = 0, d = 0;
  for (const row of rows) {
    v += row[0] ?? 0;
    a += row[1] ?? 0;
    d += row[3] ?? 0;
  }
  const n = rows.length;
  return { valence: v / n, arousal: a / n, dominance: d / n };
}

function calculateSceneFit(timeline: unknown, brief: PADRange): number {
  const m = meanPAD(timeline);
  if (!m) return 0;
  const dV = distFromRange(m.valence,   brief.valence);
  const dA = distFromRange(m.arousal,   brief.arousal);
  const dD = distFromRange(m.dominance, brief.dominance);
  const dist = Math.sqrt(dV * dV + dA * dA + dD * dD);
  return Math.round((1 - Math.min(1, dist / MAX_PAD_DIST)) * 100);
}

// ─── Clearance score (mirrored from demo.ts) ─────────────────────────────────

interface RightsProfileLike {
  masterOwnershipPct?: unknown;
  writerName?: string | null;
  writerIpi?: string | null;
  publisherName?: string | null;
  proAffiliation?: string | null;
  isOneStop?: boolean | null;
}

interface ClearanceResult {
  score: number;
  blockers: string[];
}

function computeClearance(rp: RightsProfileLike | null): ClearanceResult {
  let score = 100;
  const blockers: string[] = [];

  if (rp === null) {
    score = 0;
    blockers.push(
      "MASTER_PCT_UNSET",
      "WRITER_UNIDENTIFIED",
      "WRITER_IPI_MISSING",
      "PUBLISHER_UNKNOWN",
      "PRO_WORK_ID_MISSING",
      "ONE_STOP_NOT_CONFIRMED",
    );
  } else {
    const masterPct = rp.masterOwnershipPct;
    if (masterPct === null || masterPct === undefined) {
      score -= 20;
      blockers.push("MASTER_PCT_UNSET");
    }
    if (!rp.writerName) {
      score -= 15;
      blockers.push("WRITER_UNIDENTIFIED");
    }
    if (!rp.writerIpi) {
      score -= 15;
      blockers.push("WRITER_IPI_MISSING");
    }
    if (!rp.publisherName) {
      score -= 15;
      blockers.push("PUBLISHER_UNKNOWN");
    }
    if (!rp.proAffiliation) {
      score -= 15;
      blockers.push("PRO_WORK_ID_MISSING");
    }
    if (rp.isOneStop !== true) {
      score -= 20;
      blockers.push("ONE_STOP_NOT_CONFIRMED");
    }
  }

  return { score: Math.max(0, score), blockers };
}

// ─── Confidence label tiers ──────────────────────────────────────────────────

function confidenceLabelFor(score: number): string {
  if (score >= 75) return "Strong fit";
  if (score >= 55) return "Possible fit";
  if (score >= 35) return "Weak fit";
  return "Poor fit";
}

// ─── Worker output ───────────────────────────────────────────────────────────

interface WorkerOutput {
  timeline: number[][];
  tempo: number;
  tonalCharacter: string;
  energyCharacter: string;
  inputHash: string;
  modelVersion: string;
  valenceMean: number;
  arousalMean: number;
  tensionMean: number;
  dominanceMean: number;
  intimacyMean: number;
  spectralCentroid: number;
  rmsEnergy: number;
  zeroCrossingRate: number;
}

function runWorker(absoluteAudioPath: string): Promise<WorkerOutput> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errs: Buffer[] = [];
    const proc = spawn(PYTHON_BIN, [WORKER_SCRIPT, absoluteAudioPath], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errs.push(d));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `analyze.py exited ${code}: ${Buffer.concat(errs).toString("utf8").trim()}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as WorkerOutput);
      } catch (e) {
        reject(
          new Error(
            `analyze.py produced invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
      }
    });

    proc.on("error", (e) => reject(new Error(`analyze.py spawn error: ${e.message}`)));
  });
}

// ─── Result contract (must match apps/frontend/src/utils/apiClient.ts) ───────

interface AnalysisResult {
  track: {
    id: string;
    title: string;
    artistName: string | null;
    isrc: string | null;
    tempo: number | null;
    tonalCharacter: string | null;
    energyCharacter: string | null;
    rmsEnergy: number | null;
    spectralCentroid: number | null;
    audioFilePath: string | null;
  };
  confidenceScore: {
    score: number;
    confidenceLabel: string;
    explanation: string;
    // canonical vector — all values 0–100 (×100 for UI display)
    sceneFitBreakdown: number;
    rightsBreakdown: number;
    lyricsBreakdown: number;
    signalBreakdown: number;
    // raw 0–1 vector for audit/downstream use
    vector: { scene: number; rights: number; lyrics: number; audioSignal: number };
    inputHash: string;
  };
  rightsProfile: {
    isOneStop: boolean | null;
    proAffiliation: string | null;
    masterVerifiedAt: string | null;
    masterOwnedBy: string | null;
    publisherName: string | null;
    writerName: string | null;
    blockers?: string[];
    rightsState: string;
  } | null;
  rank: number;
}

// ─── In-memory job store ─────────────────────────────────────────────────────

interface SceneParams {
  pacing: "slow" | "mid" | "driving" | null;
  emotionalRegister: string | null;
  sceneLengthSec: number | null;
}

interface JobRecord {
  status: "pending" | "processing" | "complete" | "failed";
  briefText: string;
  briefId: string;
  sceneParams: SceneParams;
  trackIds: string[];
  results: AnalysisResult[];
  error?: string;
  startedAt: number;
}

const jobs = new Map<string, JobRecord>();

// ─── Async processing ────────────────────────────────────────────────────────


async function processJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = "processing";

  const results: AnalysisResult[] = [];
  const briefDef = BRIEFS[job.briefId];

  try {
    for (const filename of job.trackIds) {
      const absolutePath = path.join(UPLOAD_DIR, filename);
      const worker = await runWorker(absolutePath);

      const title = filename
        .replace(/\.[^./\\]+$/, "")
        .replace(/^[a-f0-9]{8}_/, "")
        .replace(/_/g, " ");
      const audioFilePath = `/audio/${filename}`;

      let track = await prisma.track.findFirst({
        where: { audioFilePath },
        include: { rightsProfile: true },
      });

      if (!track) {
        track = await prisma.track.create({
          data: {
            title,
            tempo: worker.tempo,
            tonalCharacter: worker.tonalCharacter,
            energyCharacter: worker.energyCharacter,
            timeline: worker.timeline,
            rmsEnergy: worker.rmsEnergy,
            spectralCentroid: worker.spectralCentroid,
            zeroCrossingRate: worker.zeroCrossingRate,
            modelVersion: worker.modelVersion,
            processedAt: new Date(),
            audioFilePath,
            trackStatus: "analyzed",
            isSynthetic: false,
          },
          include: { rightsProfile: true },
        });
      }

      // If enrichment hasn't run yet for this track, await it now before scoring
      if (!track.rightsProfile || !(track.rightsProfile as Record<string, unknown>)["enrichedAt"]) {
        await enrichRightsProfile(
          track.id,
          track.title,
          track.artistName ?? '',
          track.isrc
        ).catch(err => console.warn('[enrichment] Pre-analysis enrichment failed:', err));
        // Re-fetch track with updated rights profile
        const refreshed = await prisma.track.findUnique({
          where: { id: track.id },
          include: { rightsProfile: true },
        });
        if (refreshed) track = refreshed;
      }

      const padValues: PADValues = {
        valence: worker.valenceMean,
        arousal: worker.arousalMean,
        dominance: worker.dominanceMean,
      };

      const sceneFit = calculateSceneFit(worker.timeline, briefDef.pad);

      const rp = track.rightsProfile as RightsProfileLike | null;
      const clearance = computeClearance(rp);
      const rightsState = computeRightsState(track.rightsProfile);

      const { vector, ranked } = buildVector({
        padSceneFit:   sceneFit,
        dspMatchScore: sceneFit,  // DSP proxy: same PAD fit until embedding layer lands
        rights: {
          clearanceScore: clearance.score,
          hasIsrc:        Boolean(track.isrc),
          acoustidScore:  (track as Record<string, unknown>).acoustidScore as number | null ?? null,
        },
        // Pass cached lyrics from the DB. If lyricsText/lyricsState are null
        // (not yet fetched for this track), buildLyricsAxis returns neutral 0.50.
        lyrics: {
          lyricsText:  track.lyricsText  ?? null,
          lyricsState: track.lyricsState ?? null,
          briefId:     job.briefId,
        },
        audioSignal: {
          tensionMean:  worker.tensionMean,
          intimacyMean: worker.intimacyMean,
          briefId:      job.briefId,
        },
      });

      const score = Math.round(ranked.score * 100);
      const explanation = selectNarrativeWithLane(track.id, job.briefId, vector, {
        tempo: track.tempo,
        tonalCharacter: track.tonalCharacter,
        energyCharacter: track.energyCharacter,
      });

      results.push({
        track: {
          id: track.id,
          title: track.title,
          artistName: track.artistName,
          isrc: track.isrc,
          tempo: track.tempo,
          tonalCharacter: track.tonalCharacter,
          energyCharacter: track.energyCharacter,
          rmsEnergy: track.rmsEnergy,
          spectralCentroid: track.spectralCentroid,
          audioFilePath: track.audioFilePath,
        },
        confidenceScore: {
          score,
          confidenceLabel: confidenceLabelFor(score),
          explanation,
          sceneFitBreakdown: Math.round(vector.scene       * 100),
          rightsBreakdown:   Math.round(vector.rights      * 100),
          lyricsBreakdown:   Math.round(vector.lyrics      * 100),
          signalBreakdown:   Math.round(vector.audioSignal * 100),
          vector,
          inputHash: ranked.inputHash,
        },
        rightsProfile: track.rightsProfile
          ? {
              isOneStop: track.rightsProfile.isOneStop,
              proAffiliation: track.rightsProfile.proAffiliation,
              masterVerifiedAt:
                track.rightsProfile.masterVerifiedAt?.toISOString() ?? null,
              masterOwnedBy: track.rightsProfile.masterOwnedBy,
              publisherName: track.rightsProfile.publisherName,
              writerName: track.rightsProfile.writerName,
              blockers: clearance.blockers,
              rightsState,
            }
          : null,
        rank: 0,
      });
    }

    results.sort((a, b) => b.confidenceScore.score - a.confidenceScore.score);
    results.forEach((r, i) => {
      r.rank = i + 1;
    });

    const finished = jobs.get(jobId);
    if (finished) {
      finished.results = results;
      finished.status = "complete";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    console.error(`[analysis] job ${jobId} failed:`, err);
    const failed = jobs.get(jobId);
    if (failed) {
      failed.status = "failed";
      failed.error = message;
    }
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post("/analysis/submit", (req: Request, res: Response) => {
  const body = req.body as {
    briefText?: unknown;
    briefId?: unknown;
    sceneParams?: unknown;
    trackIds?: unknown;
  };

  const { briefText, briefId, sceneParams, trackIds } = body;

  if (typeof briefText !== "string" || typeof briefId !== "string") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  if (!BRIEF_WEIGHTS[briefId] || !BRIEFS[briefId]) {
    res.status(400).json({ error: "unknown_brief", message: `Unknown briefId "${briefId}"` });
    return;
  }

  if (!Array.isArray(trackIds) || trackIds.length === 0 || trackIds.length > 10) {
    res.status(400).json({ error: "invalid_track_ids", message: "trackIds must be 1–10 items" });
    return;
  }

  for (const t of trackIds) {
    if (typeof t !== "string" || t.length === 0) {
      res.status(400).json({ error: "invalid_track_ids" });
      return;
    }
    if (t.includes("..") || t.includes("/") || t.includes("\\")) {
      res.status(400).json({ error: "path_traversal_blocked", message: `Illegal filename "${t}"` });
      return;
    }
  }

  for (const t of trackIds as string[]) {
    if (!fs.existsSync(path.join(UPLOAD_DIR, t))) {
      res.status(404).json({ error: "file_not_found", message: `No audio file "${t}"` });
      return;
    }
  }

  const sp = (sceneParams ?? {}) as Partial<SceneParams>;
  const normalizedSceneParams: SceneParams = {
    pacing: sp.pacing ?? null,
    emotionalRegister: sp.emotionalRegister ?? null,
    sceneLengthSec: sp.sceneLengthSec ?? null,
  };

  const jobId = randomUUID();
  jobs.set(jobId, {
    status: "pending",
    briefText,
    briefId,
    sceneParams: normalizedSceneParams,
    trackIds: trackIds as string[],
    results: [],
    startedAt: Date.now(),
  });

  void processJob(jobId);

  res.status(202).json({ jobId });
});

router.get("/analysis/status/:jobId", (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ error: "job_not_found" });
    return;
  }

  if (job.status === "complete") {
    res.json({ status: "complete", results: job.results });
    return;
  }
  if (job.status === "failed") {
    res.json({ status: "failed", error: job.error ?? "Analysis failed" });
    return;
  }
  res.json({ status: job.status });
});

export default router;
