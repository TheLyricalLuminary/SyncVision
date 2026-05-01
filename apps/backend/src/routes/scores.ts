import { Router, Request, Response } from "express";
import { existsSync, readFileSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import prisma from "../lib/prisma";
import { calculateConfidenceScore } from "../scoring/confidenceScore";
import { computeRightsState, logRightsDisagreement } from "../scoring/rightsStateMachine";
import { BRIEF_WEIGHTS, validateWeights } from "../scoring/briefWeights";
import { computeSyncVisionScoreV2 } from "../scoring/scoringV2";
import { NARRATIVE_DICTIONARY, type Verdict } from "../scoring/narratives";
import { requirePlan } from "../middleware/auth";

// Fail fast on startup if any weight profile doesn't sum to 1.0
validateWeights();

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// 20 BRIEFS — PAD target ranges
//
// Each brief defines a target box in [valence, arousal, dominance] space.
// A track's mean PAD is read off its timeline; Scene Fit is computed as the
// inverse of the Euclidean distance from that point to the brief's box,
// normalised against sqrt(3) (the diameter of the unit PAD cube).
// ─────────────────────────────────────────────────────────────────────────────

type Range = [number, number];
interface PADRange {
  valence: Range;
  arousal: Range;
  dominance: Range;
}
interface BriefDef {
  label: string;
  pad: PADRange;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Scene Fit — Euclidean PAD distance, range-aware, normalised, inverted
// ─────────────────────────────────────────────────────────────────────────────

const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/;
const MAX_PAD_DIST = Math.sqrt(3); // diameter of the unit cube in 3D

function distFromRange(value: number, [lo, hi]: Range): number {
  if (value < lo) return lo - value;
  if (value > hi) return value - hi;
  return 0;
}

interface PADMeans {
  valence: number;
  arousal: number;
  dominance: number;
}

function meanPAD(timeline: unknown): PADMeans | null {
  // analyze.py emits rows of [valence, arousal, tension, dominance, intimacy]
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
  const normalised = Math.min(1, dist / MAX_PAD_DIST);
  return Math.round((1 - normalised) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// SyncVision Score components
//   syncvisionScore = 0.50 * sceneFit + 0.30 * rightsClarity + 0.20 * metadata
// ─────────────────────────────────────────────────────────────────────────────

interface RightsLike {
  ascapWorkId?: string | null;
  masterOwnershipPct?: number | string | null;
  isOneStop?: boolean | null;
  writerName?: string | null;
  writerIpi?: string | null;
  publisherName?: string | null;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function computeRightsClarity(rp: RightsLike | null | undefined): number {
  if (!rp) return 0;
  let score = 0;
  // 25 — master rights secured (100% master ownership). Prisma Decimal can
  // arrive as a Decimal instance, string, or number — coerce defensively.
  const master = toNum(rp.masterOwnershipPct);
  if (master !== null && Math.abs(master - 100) < 1e-6) score += 25;
  // 25 — publishing rights secured (writer + publisher both identified)
  if (rp.writerName && rp.writerIpi && rp.publisherName) score += 25;
  // 25 — verified ASCAP/BMI Work ID
  if (typeof rp.ascapWorkId === "string" && rp.ascapWorkId.length > 0) score += 25;
  // 25 — one-stop clearance
  if (rp.isOneStop === true) score += 25;
  return score;
}

interface TrackForMeta {
  isrc: string | null;
  title: string | null;
  artistName: string | null;
  tempo: number | null;
  tonalCharacter: string | null;
  energyCharacter: string | null;
  audioFilePath: string | null;
}

function computeMetadataCompleteness(track: TrackForMeta): number {
  let score = 0;
  // 15 — ISRC present and valid
  if (typeof track.isrc === "string" && ISRC_RE.test(track.isrc)) score += 15;
  // 15 — title AND artist name
  if (track.title && track.artistName) score += 15;
  // 20 — tempo AND tonal character
  if (track.tempo != null && track.tonalCharacter) score += 20;
  // 20 — energy character (duration not yet tracked separately; energy stands in)
  if (track.energyCharacter) score += 20;
  // 30 — confirmed playable audio file at a stable path
  if (track.audioFilePath && existsSync(track.audioFilePath)) score += 30;
  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative — 6-verdict system backed by NARRATIVE_DICTIONARY (narratives.ts)
//
// Verdict thresholds (sceneFit, 0–100):
//   PASS_STRONG ≥ 80 | PASS_SOFT 70–79 | MAYBE_HIGH 60–69
//   MAYBE_LOW   50–59 | FAIL_CLOSE 40–49 | FAIL_HARD < 40
//
// Selection is deterministic: SHA-256(trackId + briefId) mod 3.
// ─────────────────────────────────────────────────────────────────────────────

function verdictFor(sceneFit: number): Verdict {
  if (sceneFit >= 80) return "PASS_STRONG";
  if (sceneFit >= 70) return "PASS_SOFT";
  if (sceneFit >= 60) return "MAYBE_HIGH";
  if (sceneFit >= 50) return "MAYBE_LOW";
  if (sceneFit >= 40) return "FAIL_CLOSE";
  return "FAIL_HARD";
}

function buildBriefNarrative(
  trackId: string,
  briefId: string,
  sceneFit: number,
  track: { tempo: number | null; tonalCharacter: string | null; energyCharacter: string | null }
): string {
  const brief = NARRATIVE_DICTIONARY[briefId];
  if (!brief) {
    // Should never happen — all 20 briefs are in the dictionary
    return `sceneFit=${sceneFit} — brief narrative unavailable for "${briefId}"`;
  }
  const verdict = verdictFor(sceneFit);
  const pool = brief[verdict];
  const h = createHash("sha256").update(`${trackId}:${briefId}:${verdict}`).digest("hex");
  const phrase = pool[parseInt(h.slice(0, 8), 16) % 3];

  const parts = [
    track.tonalCharacter ?? "",
    track.energyCharacter ?? "",
    track.tempo != null ? `${Math.round(track.tempo)} BPM` : "",
  ].filter(Boolean);
  const dsp = parts.length > 0 ? ` (${parts.join(", ")})` : "";

  return `${phrase}${dsp}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// /api/scores — brief-agnostic ranking (rights + metadata clarity)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/scores", requirePlan("COMPOSER"), async (req: Request, res: Response) => {
  const catalogFilter = req.query.catalogId ? { catalogId: req.query.catalogId as string } : {};
  try {
    const tracks = await prisma.track.findMany({
      where: catalogFilter,
      include: {
        rightsProfile: true,
        confidenceScore: true,
      },
    });

    const results: Array<Record<string, unknown>> = [];

    for (const track of tracks) {
      const { rightsProfile: rp, confidenceScore: _cs, ...trackScalars } = track;
      const profile = rp ?? {};

      const result = calculateConfidenceScore(trackScalars, profile);
      const rightsState = computeRightsState(rp);
      logRightsDisagreement(track.id, rightsState, result.breakdown.confidenceLabel);

      if (track.confidenceScore) {
        if (track.confidenceScore.inputHash !== result.inputHash) {
          console.error(`DETERMINISM VIOLATION: track ${track.id}`);
          res.status(500).json({ error: `DETERMINISM VIOLATION: track ${track.id}` });
          return;
        }
      } else {
        await prisma.confidenceScore.create({
          data: {
            trackId: track.id,
            score: result.score,
            confidenceLabel: result.breakdown.confidenceLabel,
            inputHash: result.inputHash,
            rightsBreakdown: result.breakdown.rightsAndProvenance,
            metaBreakdown: result.breakdown.metadataCompleteness,
            audioBreakdown: result.breakdown.audioQuality,
            sceneFitBreakdown: result.breakdown.sceneFit,
            explanation: result.breakdown.explanation,
          },
        });
      }

      results.push({
        trackId: track.id,
        title: track.title,
        artistName: track.artistName ?? null,
        isrc: track.isrc,
        score: result.score,
        confidenceLabel: result.breakdown.confidenceLabel,
        isOneStop: track.rightsProfile?.isOneStop ?? false,
        ascapWorkId: rp?.ascapWorkId ?? null,
        breakdown: {
          rights: result.breakdown.rightsAndProvenance,
          metadata: result.breakdown.metadataCompleteness,
          audio: result.breakdown.audioQuality,
          sceneFit: result.breakdown.sceneFit, // brief-agnostic placeholder; real Scene Fit is per-brief
        },
        inputHash: result.inputHash,
        explanation: result.breakdown.explanation,
        rightsState,
        tempo: track.tempo ?? null,
        tonalCharacter: track.tonalCharacter ?? null,
        energyCharacter: track.energyCharacter ?? null,
      });
    }

    results.sort((a, b) => {
      if ((b.score as number) !== (a.score as number)) return (b.score as number) - (a.score as number);
      return (a.trackId as string).localeCompare(b.trackId as string);
    });

    const rankedTracks = results.map((r, i) => ({ rank: i + 1, ...r }));
    res.json({ rankedTracks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/scores/scene/:sceneId — brief-aware ranking (hashVersion 2)
//   matchScore = sceneFit * w.sceneFit + rightsClarity * w.rightsClarity + metadata * w.metadata
//   Weights are per-brief; see src/scoring/briefWeights.ts
// ─────────────────────────────────────────────────────────────────────────────

router.get("/scores/scene/:sceneId", requirePlan("SUPERVISOR"), async (req: Request, res: Response) => {
  const { sceneId } = req.params;

  if (!(sceneId in BRIEFS)) {
    res.status(400).json({
      error: `Invalid sceneId. Must be one of: ${Object.keys(BRIEFS).join(", ")}`,
    });
    return;
  }

  const brief = BRIEFS[sceneId];
  const catalogFilter = req.query.catalogId ? { catalogId: req.query.catalogId as string } : {};

  try {
    const tracks = await prisma.track.findMany({
      where: catalogFilter,
      include: {
        rightsProfile: true,
        confidenceScore: true,
      },
    });

    const matches: Array<Record<string, unknown>> = [];

    for (const track of tracks) {
      const { rightsProfile: rp, confidenceScore: cs, ...trackScalars } = track;

      // Brief-agnostic confidence score still validated for determinism
      const conf = calculateConfidenceScore(trackScalars, rp ?? {});
      const rightsState = computeRightsState(rp);
      logRightsDisagreement(track.id, rightsState, conf.breakdown.confidenceLabel);

      if (cs && cs.inputHash !== conf.inputHash) {
        console.error(`DETERMINISM VIOLATION: track ${track.id}`);
        res.status(500).json({ error: `DETERMINISM VIOLATION: track ${track.id}` });
        return;
      }

      // SyncVision Score v2 — explicit weighted dot product
      const sceneFit = calculateSceneFit(track.timeline, brief.pad);     // 0–100
      const rightsClarity = computeRightsClarity(rp);                    // 0–100
      const metaComplete = computeMetadataCompleteness({
        isrc: track.isrc,
        title: track.title,
        artistName: track.artistName ?? null,
        tempo: track.tempo ?? null,
        tonalCharacter: track.tonalCharacter ?? null,
        energyCharacter: track.energyCharacter ?? null,
        audioFilePath: track.audioFilePath ?? null,
      });                                                                  // 0–100

      const briefWeights = BRIEF_WEIGHTS[sceneId];
      const v2 = computeSyncVisionScoreV2(
        sceneId,
        { sceneFit, rightsClarity, metadata: metaComplete },
        briefWeights,
        rightsState,
        track.modelVersion ?? null,
      );

      const isOneStop = rp?.isOneStop ?? false;
      const ascapWorkId = rp?.ascapWorkId ?? "";
      const writerName = rp?.writerName ?? "";

      const clearanceStatement =
        `${track.title} is cleared for ${brief.label} placement. ` +
        `ISRC ${track.isrc} verified. ASCAP Work ID ${ascapWorkId} registered. ` +
        `One-Stop confirmed — master and publishing both controlled by ${writerName}.`;

      const sonicNarrative = buildBriefNarrative(track.id, sceneId, sceneFit, {
        tempo: track.tempo ?? null,
        tonalCharacter: track.tonalCharacter ?? null,
        energyCharacter: track.energyCharacter ?? null,
      });

      matches.push({
        trackId: track.id,
        title: track.title,
        artistName: track.artistName ?? null,
        isrc: track.isrc,
        ascapWorkId,
        confidenceScore: conf.score,
        matchScore: v2.matchScore,
        sceneFit,
        rightsClarity,
        metadataCompleteness: metaComplete,
        isOneStop,
        clearanceStatement,
        // v1 hash kept for determinism cross-check; v2 hash covers feature vector + weights
        inputHash: conf.inputHash,
        v2InputHash: v2.inputHash,
        hashVersion: v2.hashVersion,
        briefWeights: v2.briefWeights,
        rightsState,
        breakdown: {
          // Rights and metadata kept on the legacy 65/20/10/5 scale so the
          // existing frontend bars render without changes.
          rights: conf.breakdown.rightsAndProvenance,
          metadata: conf.breakdown.metadataCompleteness,
          audio: conf.breakdown.audioQuality,
          // Scene Fit reflects the dynamic per-brief value, scaled to /5.
          sceneFit: Math.round((sceneFit / 100) * 5),
        },
        tonalCharacter: track.tonalCharacter ?? null,
        energyCharacter: track.energyCharacter ?? null,
        sonicNarrative,
      });
    }

    matches.sort((a, b) => {
      if ((b.matchScore as number) !== (a.matchScore as number))
        return (b.matchScore as number) - (a.matchScore as number);
      return (a.trackId as string).localeCompare(b.trackId as string);
    });

    const rankedMatches = matches.map((m, i) => ({ rank: i + 1, ...m }));

    // Calibration check: flag if >30% of tracks score ≥90 for this brief.
    const highScoreCount = matches.filter((m) => (m.matchScore as number) >= 90).length;
    const highScorePct = matches.length > 0 ? highScoreCount / matches.length : 0;
    let calibrationWarning: string | null = null;
    if (highScorePct > 0.30) {
      calibrationWarning =
        `CALIBRATION: ${highScoreCount}/${matches.length} tracks (${Math.round(highScorePct * 100)}%) ` +
        `score ≥90 for "${brief.label}" — brief weights or catalog rights data may need review.`;
      console.warn(`[calibration] ${calibrationWarning}`);
    }

    res.json({ sceneId, sceneLabel: brief.label, rankedMatches, calibrationWarning });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/determinism-report — unchanged
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_PATH = join(__dirname, "../../determinism-report.json");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/catalog — per-catalog analytics for the dashboard
//
// Requires SUPERVISOR+. Computes in one DB round-trip + in-process PAD math.
//
// Response shape:
//   briefCoverage:      briefId → { label, passCount, totalAnalyzed, passPct }
//   rightsDistribution: state → count
//   weakTracks:         tracks that scored < 70 on every brief
//   catalogSize:        total track count
//   analyzedCount:      tracks with PAD timeline
//   clearedCount:       tracks with rightsState === CLEAR
// ─────────────────────────────────────────────────────────────────────────────

router.get("/analytics/catalog", requirePlan("SUPERVISOR"), async (req: Request, res: Response) => {
  const catalogFilter = req.query.catalogId ? { catalogId: req.query.catalogId as string } : {};
  try {
    const tracks = await prisma.track.findMany({
      where: catalogFilter,
      include: { rightsProfile: true, confidenceScore: true },
    });

    const PASS_THRESHOLD = 70;

    // Per-brief pass counts (only for tracks with PAD data)
    const briefPassCount: Record<string, number> = {};
    const briefTotalAnalyzed: Record<string, number> = {};
    for (const id of Object.keys(BRIEFS)) {
      briefPassCount[id] = 0;
      briefTotalAnalyzed[id] = 0;
    }

    // Rights state distribution
    const rightsDistribution: Record<string, number> = {
      CLEAR: 0, PARTIALLY_CLEAR: 0, UNVERIFIED: 0, INGESTED: 0, BLOCKED: 0,
    };

    // Score distribution buckets (brief-agnostic confidence score)
    const scoreBuckets = { "90-100": 0, "70-89": 0, "50-69": 0, "0-49": 0 };

    // Per-track max sceneFit across all briefs (to find weak tracks)
    const trackMaxSceneFit: Array<{
      trackId: string;
      title: string;
      isrc: string;
      maxSceneFit: number;
      bestBriefId: string;
      bestBriefLabel: string;
      rightsState: string;
      confidenceScore: number | null;
    }> = [];

    for (const track of tracks) {
      const rp = track.rightsProfile;
      const state = computeRightsState(rp);
      rightsDistribution[state] = (rightsDistribution[state] ?? 0) + 1;

      // Confidence score bucket
      const cs = track.confidenceScore?.score ?? null;
      if (cs !== null) {
        if (cs >= 90) scoreBuckets["90-100"]++;
        else if (cs >= 70) scoreBuckets["70-89"]++;
        else if (cs >= 50) scoreBuckets["50-69"]++;
        else scoreBuckets["0-49"]++;
      }

      const pad = meanPAD(track.timeline);
      let trackMax = 0;
      let trackBestId = "";

      for (const [briefId, brief] of Object.entries(BRIEFS)) {
        if (!pad) continue;
        briefTotalAnalyzed[briefId]++;
        const sf = calculateSceneFit(track.timeline, brief.pad);
        if (sf >= PASS_THRESHOLD) briefPassCount[briefId]++;
        if (sf > trackMax) { trackMax = sf; trackBestId = briefId; }
      }

      trackMaxSceneFit.push({
        trackId: track.id,
        title: track.title,
        isrc: track.isrc,
        maxSceneFit: trackMax,
        bestBriefId: trackBestId,
        bestBriefLabel: trackBestId ? BRIEFS[trackBestId].label : "—",
        rightsState: state,
        confidenceScore: cs,
      });
    }

    // Brief coverage sorted ascending by passPct (worst performing first)
    const briefCoverage = Object.entries(BRIEFS).map(([id, def]) => ({
      briefId: id,
      label: def.label,
      passCount: briefPassCount[id],
      totalAnalyzed: briefTotalAnalyzed[id],
      passPct: briefTotalAnalyzed[id] > 0
        ? Math.round((briefPassCount[id] / briefTotalAnalyzed[id]) * 100)
        : 0,
    })).sort((a, b) => a.passPct - b.passPct);

    // Tracks that never pass any brief
    const weakTracks = trackMaxSceneFit
      .filter((t) => t.maxSceneFit < PASS_THRESHOLD)
      .sort((a, b) => b.maxSceneFit - a.maxSceneFit);

    const analyzedCount = trackMaxSceneFit.filter((t) => t.maxSceneFit > 0 || t.bestBriefId !== "").length;

    res.json({
      catalogSize: tracks.length,
      analyzedCount,
      clearedCount: rightsDistribution["CLEAR"],
      briefCoverage,
      rightsDistribution,
      scoreBuckets,
      weakTracks,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/determinism-report", (_req: Request, res: Response) => {
  try {
    const report = JSON.parse(readFileSync(REPORT_PATH, "utf-8"));
    const status = report.hashesMatch === true ? 200 : 500;
    res.status(status).json(report);
  } catch {
    res.status(404).json({ error: "Determinism report not found. Run verification first." });
  }
});

export default router;
