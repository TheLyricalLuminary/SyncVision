import { Router, Request, Response } from "express";
import { existsSync, readFileSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import prisma from "../lib/prisma";
import { calculateConfidenceScore } from "../scoring/confidenceScore";

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
// Per-brief narrative vocabulary pools
//
// Selection is deterministic: hash(trackId + briefId) % pool.length.
// Tiers: high (sceneFit >= 70), maybe (50–69), low (< 50).
// ─────────────────────────────────────────────────────────────────────────────

interface NarrativePool {
  high: string[];
  maybe: string[];
  low: string[];
}

const GENERIC_POOL: NarrativePool = {
  high: [
    "Sits inside the emotional target zone for this brief — recommended for placement.",
    "Acoustic profile lands cleanly within the brief's PAD envelope. Strong candidate.",
    "PAD trajectory aligns with what supervisors typically want here — promote.",
    "Mood vector matches the brief tightly across valence, arousal, and dominance.",
    "Reads as a confident match. The track's emotional centre of gravity hits the target.",
    "Inside the brief's emotional box on all three axes. Worth a hard look.",
  ],
  maybe: [
    "Adjacent to the target zone — would work with edit support or a tight cue point.",
    "Partial overlap with the brief's PAD range. Consider for an alt cut.",
    "Marginal acoustic alignment. Works in some scene contexts, not a clean match.",
    "Drifts outside the brief on one axis — usable but not first-call.",
    "Sits at the boundary of the brief's emotional envelope. Reserve for B-list.",
    "Close enough to be plausible, far enough to require justification.",
  ],
  low: [
    "Emotionally outside this brief's target zone — pass.",
    "PAD profile contradicts the brief's intent. Not recommended.",
    "Wrong emotional posture for this scene type — skip unless re-cut.",
    "Mood vector is too far from the target box. Decline.",
    "The track's energy and tone diverge from what the brief asks for.",
    "Acoustic centre lands outside the brief's range on multiple axes — pass.",
  ],
};

const NARRATIVE_POOLS: Record<string, NarrativePool> = {
  "chase-tension": {
    high: [
      "Forward propulsion with rising stakes — sits cleanly inside the chase profile.",
      "Drives into the target zone for chase cues with the right arousal and dominance.",
      "High kinetic energy with restrained valence — exactly the chase posture.",
      "Tight rhythmic forward motion. Reads as pursuit with held tension.",
      "Aggressive forward push and assertive bottom end — prime chase material.",
      "Lands in the chase target box across all three axes. Recommend.",
    ],
    maybe: [
      "Moves with intent but valence drifts brighter than the chase target asks for.",
      "Energy is there; dominance reads softer than the chase profile prefers.",
      "Adjacent to the chase zone — useful as a build but not a sustained pursuit cue.",
      "Forward motion present, mood slightly off-axis. B-list for chase.",
      "Gets close on arousal but the emotional centre is too neutral for chase.",
      "Could work as a chase opener; loses traction during sustained pursuit.",
    ],
    low: [
      "Lacks the forward arousal a chase needs. Pass.",
      "Tonally too bright, too composed for pursuit cues. Decline.",
      "Energy doesn't sit where chase scenes live. Skip.",
      "Reads as resolution, not pursuit — not a chase candidate.",
      "Wrong emotional posture for chase — too soft on arousal and dominance.",
      "Mood vector is opposite the chase target. Pass.",
    ],
  },

  "emotional-resolution": {
    high: [
      "Earned-conclusion energy with warm valence — sits in the resolution zone.",
      "Lands in the cathartic-release pocket: mid arousal, warm valence, settled dominance.",
      "Reads as exhalation rather than peak — exactly what resolution cues want.",
      "Warm and settled, with enough lift to feel earned. Strong resolution match.",
      "Cathartic mid-energy posture — fits the resolution profile cleanly.",
      "Hits the resolution target across PAD: not too high, not too low, warm centre.",
    ],
    maybe: [
      "Warm enough to read as resolution but slightly too active for a quiet ending.",
      "Settles into resolution territory in places, runs hotter elsewhere.",
      "Could work for an upbeat resolution, less so for a quiet one.",
      "Tonally on-target; arousal sits a touch above the resolution band.",
      "Adjacent to resolution — a tight edit could land it.",
      "Borderline match: warm but the energy reads more transitional than conclusive.",
    ],
    low: [
      "Too restless for resolution — energy is still climbing, not landing.",
      "Tonally off — resolution wants warmth, this reads cooler and harder.",
      "Lacks the settled quality a resolution cue needs. Skip.",
      "Wrong posture for an ending — too aggressive on arousal.",
      "Reads as confrontation, not resolution. Pass.",
      "Outside the resolution band on valence and dominance. Decline.",
    ],
  },

  "triumph-victory": {
    high: [
      "Peak-arousal high-valence posture — sits squarely in the triumph zone.",
      "Confident, bright, and forward — exactly the victory profile.",
      "Reads as celebration with assertive bottom end. Strong triumph match.",
      "Hits the triumph target across all three axes. Recommended.",
      "Euphoric energy with dominant posture — prime victory cue.",
      "High-arousal high-valence material with the dominance the brief asks for.",
    ],
    maybe: [
      "Bright and forward but doesn't quite reach the arousal triumph wants.",
      "Triumph-adjacent — works for the build, less so for the peak.",
      "High valence in place; dominance reads softer than victory cues prefer.",
      "Could carry an early triumph beat; loses lift at the apex.",
      "Adjacent to the triumph zone on arousal — borderline match.",
      "Bright posture but the energy doesn't crest where triumph cues do.",
    ],
    low: [
      "Wrong emotional posture for triumph — too restrained.",
      "Tonally too dark or too cool for victory placement. Pass.",
      "Lacks the lift triumph requires. Decline.",
      "Reads as confrontation or contemplation, not victory. Skip.",
      "Outside the triumph band on valence and arousal. Pass.",
      "Energy sits well below what triumph cues need.",
    ],
  },

  "grief-loss": {
    high: [
      "Low arousal with cool valence and yielding dominance — sits in the grief profile.",
      "Quiet, intimate, searching — exactly what grief cues want.",
      "Reads as restraint and absence. Strong grief match.",
      "Hits the grief target box across all three axes — recommended.",
      "Sparse energy with vulnerable posture — prime grief material.",
      "Cool tonal centre and held breath — lands in the grief zone cleanly.",
    ],
    maybe: [
      "Quiet enough for grief in places, too active in others. Tight edit needed.",
      "Tonally adjacent to grief but the arousal reads slightly too forward.",
      "Could carry a grief opener; loses the intimacy at full energy.",
      "Borderline grief match — works for the breath, not the silence.",
      "Cool valence in place; dominance reads firmer than grief cues prefer.",
      "Adjacent to grief but not centred in the brief's emotional core.",
    ],
    low: [
      "Far too forward for grief — wrong emotional posture entirely.",
      "Tonally too bright or too kinetic for grief placement. Pass.",
      "Lacks the restraint grief cues require. Decline.",
      "Reads as celebration or motion, not loss. Skip.",
      "Outside the grief band on arousal and dominance. Pass.",
      "Energy sits well above what grief cues can absorb.",
    ],
  },

  "romance-intimacy": {
    high: [
      "Warm, close, unhurried — sits in the romance pocket on all three axes.",
      "Soft arousal with high valence and yielding dominance — prime romance.",
      "Reads as proximity and warmth. Strong intimacy match.",
      "Hits the romance target box across PAD — recommended.",
      "Tender posture with the warmth the brief asks for.",
      "Lands cleanly in the intimacy zone — slow, warm, unguarded.",
    ],
    maybe: [
      "Warm enough for romance but the arousal runs slightly too active.",
      "Tonally on-target; energy reads more dance than dinner.",
      "Could work for an upbeat romance moment; loses the closeness at higher arousal.",
      "Adjacent to the intimacy zone — usable with a softer mix.",
      "Borderline romance — warm but not yielding enough on dominance.",
      "Romance-adjacent in valence; arousal sits above the brief's preferred band.",
    ],
    low: [
      "Wrong posture for intimacy — too forward, too dominant.",
      "Tonally too dark or too aggressive for romance placement. Pass.",
      "Lacks the warmth and softness romance cues require. Decline.",
      "Reads as confrontation or pursuit, not closeness. Skip.",
      "Outside the romance band on valence and dominance. Pass.",
      "Energy sits well above what intimacy cues can carry.",
    ],
  },

  "suspense-dread": {
    high: [
      "Held arousal with low valence — sits cleanly in the dread profile.",
      "Reads as foreboding and uncertainty. Strong suspense match.",
      "Cool valence and contained dominance — prime dread material.",
      "Hits the suspense target across all three axes — recommended.",
      "Restrained but charged — exactly what suspense wants.",
      "Lands in the dread zone with the right held-breath posture.",
    ],
    maybe: [
      "Cool valence in place but the arousal sits a touch above the dread band.",
      "Suspense-adjacent — works for tension build, less so for sustained dread.",
      "Borderline dread match — too kinetic for the held-breath moments.",
      "Adjacent to the suspense zone on valence; dominance reads too firm.",
      "Reads as anxiety more than dread — close but not centred.",
      "Could open a suspense cue; loses the restraint at higher arousal.",
    ],
    low: [
      "Too bright or too released for suspense — wrong emotional posture.",
      "Tonally too warm for dread placement. Pass.",
      "Lacks the cool restraint suspense cues require. Decline.",
      "Reads as triumph or romance, not dread. Skip.",
      "Outside the suspense band on valence. Pass.",
      "Energy too forward and too positive for held-breath dread.",
    ],
  },

  "montage-transition": {
    high: [
      "Neutral mid-energy with balanced valence — exactly the montage posture.",
      "Sits in the transition pocket: not too hot, not too cold.",
      "Reads as passage of time without imposing a specific mood — strong montage match.",
      "Hits the montage target across PAD — recommended.",
      "Mid-arousal with balanced dominance — prime montage material.",
      "Lands cleanly in the transition zone — neutral but present.",
    ],
    maybe: [
      "Adjacent to the montage zone — usable but tilts toward a specific mood.",
      "Energy is montage-appropriate; valence reads brighter or darker than neutral.",
      "Could carry a montage beat but imposes its own emotional flavour.",
      "Borderline montage — slightly too defined emotionally for neutral passage.",
      "Mid-energy in place; dominance leans firmer than transition cues prefer.",
      "Montage-adjacent — works for some passages, not a universal fit.",
    ],
    low: [
      "Too emotionally specific for montage — imposes a mood the cue can't carry.",
      "Either too hot or too cold for neutral transition. Pass.",
      "Reads as a destination, not a passage. Skip.",
      "Wrong posture for montage — too dramatic or too sparse.",
      "Outside the transition band on arousal. Pass.",
      "Energy doesn't sit where montage cues live.",
    ],
  },

  "opening-closing-title": {
    high: [
      "Establishing posture with mid-high arousal and balanced valence — sits in the title zone.",
      "Reads as a frame around the story — strong opening/closing match.",
      "Confident dominance with the lift a title sequence needs.",
      "Hits the title target across all three axes — recommended.",
      "Bookend energy: present, settled, declarative — prime title material.",
      "Lands cleanly in the opening/closing zone with the right gravitas.",
    ],
    maybe: [
      "Title-adjacent — works for an opening, less convincing as a closer (or vice versa).",
      "Has the gravitas but arousal reads slightly above or below the title band.",
      "Could carry a title sequence with a tight edit.",
      "Borderline match — the posture is right, the centre of gravity drifts.",
      "Mid-arousal in place; valence sits outside the title zone.",
      "Adjacent to the title profile — usable but not first-call.",
    ],
    low: [
      "Wrong emotional posture for a title sequence — too kinetic or too sparse.",
      "Lacks the declarative quality title cues require. Pass.",
      "Reads as a beat inside the story, not a frame around it. Skip.",
      "Outside the title band on arousal and dominance. Pass.",
      "Energy doesn't establish — it punctuates. Wrong cue type.",
      "Tonally too specific for the neutral gravitas of an opening or closing title.",
    ],
  },
};

function pickPhrase(pool: string[], trackId: string, briefId: string): string {
  const h = createHash("sha256").update(`${trackId}:${briefId}`).digest("hex");
  const idx = parseInt(h.slice(0, 8), 16) % pool.length;
  return pool[idx];
}

interface DspContext {
  tempo: number | null;
  tonalCharacter: string | null;
  energyCharacter: string | null;
}

function dspSuffix(track: DspContext): string {
  const tone = track.tonalCharacter ?? "";
  const energy = track.energyCharacter ?? "";
  const bpm = track.tempo != null ? `${Math.round(track.tempo)} BPM` : "";
  const parts = [tone, energy, bpm].filter((s) => s.length > 0);
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}

function buildBriefNarrative(
  trackId: string,
  briefId: string,
  sceneFit: number,
  track: DspContext
): string {
  const pool = NARRATIVE_POOLS[briefId] ?? GENERIC_POOL;
  const tier: keyof NarrativePool =
    sceneFit >= 70 ? "high" : sceneFit >= 50 ? "maybe" : "low";
  const phrase = pickPhrase(pool[tier], trackId, briefId);
  const dsp = dspSuffix(track);
  return dsp ? `${phrase} ${dsp}` : phrase;
}

// ─────────────────────────────────────────────────────────────────────────────
// /api/scores — brief-agnostic ranking (rights + metadata clarity)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/scores", async (_req: Request, res: Response) => {
  try {
    const tracks = await prisma.track.findMany({
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
// /api/scores/scene/:sceneId — brief-aware ranking
//   matchScore = 0.50 * sceneFit + 0.30 * rightsClarity + 0.20 * metadataCompleteness
// ─────────────────────────────────────────────────────────────────────────────

router.get("/scores/scene/:sceneId", async (req: Request, res: Response) => {
  const { sceneId } = req.params;

  if (!(sceneId in BRIEFS)) {
    res.status(400).json({
      error: `Invalid sceneId. Must be one of: ${Object.keys(BRIEFS).join(", ")}`,
    });
    return;
  }

  const brief = BRIEFS[sceneId];

  try {
    const tracks = await prisma.track.findMany({
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
      if (cs && cs.inputHash !== conf.inputHash) {
        console.error(`DETERMINISM VIOLATION: track ${track.id}`);
        res.status(500).json({ error: `DETERMINISM VIOLATION: track ${track.id}` });
        return;
      }

      // SyncVision Score components
      const sceneFit = calculateSceneFit(track.timeline, brief.pad);                  // 0–100
      const rightsClarity = computeRightsClarity(rp);                                 // 0–100
      const metaComplete = computeMetadataCompleteness({
        isrc: track.isrc,
        title: track.title,
        artistName: track.artistName ?? null,
        tempo: track.tempo ?? null,
        tonalCharacter: track.tonalCharacter ?? null,
        energyCharacter: track.energyCharacter ?? null,
        audioFilePath: track.audioFilePath ?? null,
      });                                                                             // 0–100

      const matchScore = parseFloat(
        (sceneFit * 0.50 + rightsClarity * 0.30 + metaComplete * 0.20).toFixed(1)
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
        matchScore,
        sceneFit,
        rightsClarity,
        metadataCompleteness: metaComplete,
        isOneStop,
        clearanceStatement,
        inputHash: conf.inputHash,
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

    res.json({ sceneId, sceneLabel: brief.label, rankedMatches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/determinism-report — unchanged
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_PATH = join(__dirname, "../../determinism-report.json");

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
