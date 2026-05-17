// GET /api/composer-report
//
// Aggregates track metadata, rights profile, and confidence scores into a
// per-track sync readiness report for the composer view. Pure read — no scoring
// recomputation. All values derived from existing persisted data.
//
// Determinism: result is a function of DB state only. Identical DB → identical output.

import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";

const router = Router();

// ── Rights completeness score (0–100) ────────────────────────────────────────
// Measures how complete the rights profile is, independent of scoring.
function rightsCompleteness(rp: {
  ascapWorkId: string | null;
  bmiWorkId?: string | null;
  writerName: string | null;
  writerIpi: string | null;
  publisherName: string | null;
  proAffiliation: string | null;
  isOneStop: boolean | null;
  masterOwnedBy?: string | null;
  masterOwnershipType?: string | null;
} | null): number {
  if (!rp) return 0;
  const fields = [
    rp.ascapWorkId ?? rp.bmiWorkId,   // PRO work ID
    rp.writerName,
    rp.writerIpi,
    rp.publisherName,
    rp.proAffiliation,
    rp.isOneStop !== null ? "present" : null,
    (rp as any).masterOwnedBy,
    (rp as any).masterOwnershipType,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

// ── Sync readiness composite (0–100) ─────────────────────────────────────────
// Weighted blend: 60% confidence score (quality signal) + 40% rights completeness
// (clearance readiness). Returns null if track has never been analyzed.
function computeSyncReadiness(
  confidenceScore: number | null,
  rightsScore: number
): number | null {
  if (confidenceScore === null) return null;
  return Math.round(confidenceScore * 0.6 + rightsScore * 0.4);
}

// ── Best brief heuristic ──────────────────────────────────────────────────────
// Derives the most likely brief category from tonal + energy character.
// Order: specific over generic.
function deriveBestBrief(
  tonalCharacter: string | null,
  energyCharacter: string | null
): string {
  const t = (tonalCharacter ?? "").toLowerCase();
  const e = (energyCharacter ?? "").toLowerCase();

  if (t.includes("dark") && e.includes("high")) return "Chase / tension";
  if (t.includes("dark") && e.includes("medium")) return "Drama / confrontation";
  if (t.includes("dark") && e.includes("low")) return "Suspense / dread";
  if (t.includes("bright") && e.includes("high")) return "Triumph / victory";
  if (t.includes("bright") && e.includes("medium")) return "Euphoria / celebration";
  if (t.includes("bright") && e.includes("low")) return "Romance / intimacy";
  if (t.includes("neutral") && e.includes("high")) return "Action / combat";
  if (t.includes("neutral") && e.includes("medium")) return "Urban / gritty";
  if (t.includes("neutral") && e.includes("low")) return "Contemplative / reflective";
  if (t.includes("warm")) return "Drama / confrontation";
  if (t.includes("cold")) return "Horror / psychological";
  return "Cinematic / epic";
}

// ── Brief score estimates ─────────────────────────────────────────────────────
// Produces estimated fit scores across 5 scene categories from character metadata.
// These are display aids for the composer, not authoritative ranking scores.
function deriveBriefScores(
  tonalCharacter: string | null,
  energyCharacter: string | null,
  baseScore: number | null
): Array<{ scene: string; score: number }> {
  const base = baseScore ?? 50;
  const t = (tonalCharacter ?? "").toLowerCase();
  const e = (energyCharacter ?? "").toLowerCase();

  const isDark    = t.includes("dark");
  const isBright  = t.includes("bright");
  const isHigh    = e.includes("high");
  const isLow     = e.includes("low");

  // Build relative affinity weights per scene category, then scale to base.
  const affinity: Record<string, number> = {
    "Chase / tension":       isDark && isHigh ? 1.0 : isDark ? 0.75 : 0.4,
    "Urban / gritty":        isDark && isHigh ? 0.9 : isDark ? 0.70 : 0.35,
    "Drama / confrontation": isDark ? 0.8 : isBright ? 0.45 : 0.6,
    "Suspense / dread":      isDark && isLow ? 0.95 : isDark ? 0.65 : 0.3,
    "Romance / intimacy":    isBright && isLow ? 0.9 : isBright ? 0.65 : 0.25,
  };

  // Normalise so the best scene = base score, others scale accordingly.
  const maxAffinity = Math.max(...Object.values(affinity));
  return Object.entries(affinity)
    .map(([scene, w]) => ({
      scene,
      score: Math.min(99, Math.max(5, Math.round((w / maxAffinity) * base))),
    }))
    .sort((a, b) => b.score - a.score);
}

// ── Metadata gaps ─────────────────────────────────────────────────────────────
type GapSeverity = "CRITICAL" | "HIGH" | "MEDIUM";
interface MetadataGap {
  field: string;
  severity: GapSeverity;
  impact: string;
}

function computeMetadataGaps(rp: {
  writerIpi: string | null;
  publisherName: string | null;
  isOneStop: boolean | null;
  ascapWorkId: string | null;
  bmiWorkId?: string | null;
  writerName: string | null;
  proAffiliation: string | null;
  masterOwnedBy?: string | null;
  masterOwnershipType?: string | null;
} | null): MetadataGap[] {
  if (!rp) {
    return [
      { field: "Rights profile", severity: "CRITICAL", impact: "No rights data — cannot assess clearance" },
    ];
  }
  const gaps: MetadataGap[] = [];
  if (!rp.writerIpi) {
    gaps.push({ field: "Writer IPI number", severity: "HIGH", impact: "Blocks trailer use in most territories" });
  }
  if (!rp.publisherName) {
    gaps.push({ field: "Publisher name", severity: "MEDIUM", impact: "Moderate fragmentation risk" });
  }
  if (rp.isOneStop === null || rp.isOneStop === undefined) {
    gaps.push({ field: "One-stop status unverified", severity: "CRITICAL", impact: "Highest priority — required for ad/trailer" });
  }
  if (!rp.ascapWorkId && !(rp as any).bmiWorkId) {
    gaps.push({ field: "PRO work ID (ASCAP / BMI)", severity: "MEDIUM", impact: "Reduces clearance confidence score" });
  }
  if (!rp.writerName) {
    gaps.push({ field: "Writer name", severity: "HIGH", impact: "Required for publisher negotiation" });
  }
  if (!(rp as any).masterOwnedBy) {
    gaps.push({ field: "Master rights holder", severity: "HIGH", impact: "Cannot confirm one-stop without this" });
  }
  return gaps;
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/composer-report", async (_req: Request, res: Response) => {
  try {
    const tracks = await prisma.track.findMany({
      include: {
        rightsProfile: true,
        confidenceScore: true,
      },
      orderBy: { id: "asc" },
    });

    const report = tracks.map((track) => {
      const rp = track.rightsProfile;
      const cs = track.confidenceScore;

      const rightsScore   = rightsCompleteness(rp);
      const syncReadiness = computeSyncReadiness(cs?.score ?? null, rightsScore);
      const bestBrief     = deriveBestBrief(track.tonalCharacter, track.energyCharacter);
      const briefScores   = deriveBriefScores(
        track.tonalCharacter,
        track.energyCharacter,
        cs?.score ?? null
      );
      const metadataGaps  = computeMetadataGaps(rp);

      // Projected readiness after gap resolution: add 3 pts per gap resolved (capped at 98)
      const projectedReadiness = syncReadiness !== null
        ? Math.min(98, syncReadiness + metadataGaps.length * 3)
        : null;

      return {
        trackId:            track.id,
        title:              track.title,
        artistName:         track.artistName ?? null,
        isrc:               track.isrc,
        trackStatus:        track.trackStatus,
        uploadedAt:         track.processedAt?.toISOString() ?? null,
        syncReadiness,
        projectedReadiness,
        bestBrief,
        briefScores,
        isOneStop:          rp?.isOneStop ?? null,
        rightsScore,
        metadataGaps,
        gapCount:           metadataGaps.length,
        confidenceLabel:    cs?.confidenceLabel ?? null,
        inputHash:          cs?.inputHash ?? null,
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      trackCount:  report.length,
      tracks:      report,
    });
  } catch (err) {
    console.error("[composer-report] error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    res.status(500).json({ error: "composer_report_error", message });
  }
});

export default router;
