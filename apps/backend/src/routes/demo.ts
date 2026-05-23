import { Router, Request, Response } from "express";
import { join } from "path";
import prisma from "../lib/prisma";
import { computeRightsState } from "../scoring/rightsStateMachine";
import { BRIEF_WEIGHTS } from "../scoring/briefWeights";
import { computeSyncVisionScoreV2 } from "../scoring/scoringV2";
import { selectNarrative } from "../scoring/narrativeDictionary";

// ─── In-memory rate limiter: 10 req / IP / hour ───────────────────────────────

interface RateBucket { count: number; resetAt: number }
const rateBuckets = new Map<string, RateBucket>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (bucket.count >= 10) return false;
  bucket.count += 1;
  return true;
}

// ─── PAD helpers (mirrored from scores.ts) ───────────────────────────────────

type Range = [number, number];
interface PADRange { valence: Range; arousal: Range; dominance: Range }
interface BriefDef  { label: string; pad: PADRange }

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

// ─── Clearance score ──────────────────────────────────────────────────────────

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
  timeline: string;
  usageAvailability: { tv: boolean; film: boolean; ad: boolean; trailer: boolean };
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

  score = Math.max(0, score);

  const clearanceTimeline =
    score >= 80 ? "48-72 hours"
    : score >= 60 ? "5-10 business days"
    : score >= 40 ? "2-4 weeks"
    : "Clearance not recommended";

  return {
    score,
    blockers,
    timeline: clearanceTimeline,
    usageAvailability: {
      tv:      score >= 60,
      film:    score >= 60,
      ad:      score >= 70,
      trailer: score >= 75,
    },
  };
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

function verdictFor(sceneFit: number): "PASS" | "MAYBE" | "FAIL" {
  if (sceneFit >= 70) return "PASS";
  if (sceneFit >= 50) return "MAYBE";
  return "FAIL";
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

router.get("/demo", (_req, res) => {
  res.sendFile(join(__dirname, "../scoring/public/demo.html"));
});

router.post("/demo/check", async (req: Request, res: Response) => {
  const ip = req.ip ?? "unknown";
  if (!checkRateLimit(ip)) {
    res.status(429).json({
      error: "rate_limited",
      message: "Demo limit reached. Request access at syncvision.io",
    });
    return;
  }

  const { isrc, usageType } = req.body as { isrc?: unknown; usageType?: unknown };

  if (!usageType || !["tv", "film", "ad", "trailer"].includes(usageType as string)) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  if (isrc !== undefined && typeof isrc !== "string") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  try {
    let track: Awaited<ReturnType<typeof prisma.track.findFirst>> | null = null;

    if (typeof isrc === "string" && isrc.length > 0) {
      track = await prisma.track.findFirst({
        where: { isrc },
        include: { rightsProfile: true, confidenceScore: true },
      });
    }

    if (!track) {
      track = await prisma.track.findFirst({
        where: { trackStatus: "analyzed" },
        include: { rightsProfile: true, confidenceScore: true },
      });
    }

    if (!track) {
      res.status(404).json({ error: "no_analyzed_tracks" });
      return;
    }

    // Clearance
    const rp = (track as any).rightsProfile as RightsProfileLike | null;
    const clearance = computeClearance(rp);

    // PAD values for narrative
    const padMeans = meanPAD(track.timeline);
    const padValues = padMeans ?? { arousal: 0.5, valence: 0.5, dominance: 0.5 };

    // Rights state for scoring
    const rightsState = computeRightsState(rp);

    // Scene fit for all 20 briefs
    const sceneFitRows = Object.entries(BRIEFS).map(([briefId, briefDef]) => {
      const sceneFit = calculateSceneFit(track!.timeline, briefDef.pad);
      const weights = BRIEF_WEIGHTS[briefId];
      const v2 = computeSyncVisionScoreV2(
        briefId,
        { sceneFit, rightsClarity: clearance.score, metadata: 80 },
        weights,
        rightsState,
        (track as any).modelVersion ?? null,
      );

      const narrative = selectNarrative(track!.id, briefId, sceneFit, padValues, { tempo: track?.tempo });
      const verdict = verdictFor(sceneFit);

      return {
        briefId,
        briefName: briefDef.label,
        sceneFitScore: sceneFit,
        matchScore: v2.matchScore,
        narrative,
        verdict,
      };
    });

    sceneFitRows.sort((a, b) => b.matchScore - a.matchScore);

    res.json({
      track: {
        id: track.id,
        title: track.title,
        artistName: (track as any).artistName ?? null,
        isrc: track.isrc,
      },
      clearance,
      sceneFit: sceneFitRows,
    });
  } catch (err) {
    console.error("[demo] error:", err);
    res.status(500).json({
      error: "internal_error",
      message: err instanceof Error ? err.message : "Unexpected error",
    });
  }
});

export default router;
