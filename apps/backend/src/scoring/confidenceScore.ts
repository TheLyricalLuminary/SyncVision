import { createHash } from "crypto";

// Mirrors the Prisma-generated types for Track and RightsProfile.
// Update field names here if the schema changes.
export interface Track {
  id?: string;
  title?: string | null;
  isrc?: string | null;
  [key: string]: unknown;
}

export interface RightsProfile {
  id?: string;
  trackId?: string;
  ascapWorkId?: string | null;
  masterOwnershipPct?: number | string | null; // Prisma Decimal arrives as string over JSON
  isOneStop?: boolean | null;
  writerName?: string | null;
  writerIpi?: string | null;
  publisherName?: string | null;
  proAffiliation?: string | null;
  [key: string]: unknown;
}

export interface ScoreBreakdown {
  rightsAndProvenance: number; // 0–65
  metadataCompleteness: number; // 0–20
  audioQuality: number; // always 10 (placeholder)
  sceneFit: number; // always 5 (placeholder)
  total: number; // 0–100
  confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
  explanation: string;
  detail: {
    isrc: number;
    ascapWorkId: number;
    masterOwnershipPct: number;
    isOneStop: number;
    writerName: number;
    writerIpi: number;
    publisherName: number;
    proAffiliation: number;
  };
}

export interface ConfidenceScoreResult {
  score: number; // 0–100, integer
  breakdown: ScoreBreakdown;
  inputHash: string; // SHA-256 hex of sorted JSON of inputs
}

const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/;

// Returns a JSON string with all object keys sorted alphabetically at every
// nesting level. This is the only way to get a deterministic hash from
// two structurally equal objects regardless of insertion order.
function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isNaN(n) ? null : n;
}

export function calculateConfidenceScore(
  track: Track,
  rightsProfile: RightsProfile
): ConfidenceScoreResult {
  // ── Rights and Provenance (65 pts) ──────────────────────────────────────
  const isrcPoints =
    typeof track.isrc === "string" && ISRC_RE.test(track.isrc) ? 20 : 0;

  const ascapPoints =
    typeof rightsProfile.ascapWorkId === "string" &&
    rightsProfile.ascapWorkId.length > 0
      ? 15
      : 0;

  const ownership = toNumber(rightsProfile.masterOwnershipPct);
  const masterPoints = ownership === 100 ? 15 : 0;

  const oneStopPoints = rightsProfile.isOneStop === true ? 15 : 0;

  const rightsAndProvenance =
    isrcPoints + ascapPoints + masterPoints + oneStopPoints;

  // ── Metadata Completeness (20 pts) ──────────────────────────────────────
  const writerNamePoints =
    typeof rightsProfile.writerName === "string" &&
    rightsProfile.writerName.length > 0
      ? 5
      : 0;

  const writerIpiPoints =
    typeof rightsProfile.writerIpi === "string" &&
    rightsProfile.writerIpi.length > 0
      ? 5
      : 0;

  const publisherPoints =
    typeof rightsProfile.publisherName === "string" &&
    rightsProfile.publisherName.length > 0
      ? 5
      : 0;

  const proPoints =
    typeof rightsProfile.proAffiliation === "string" &&
    rightsProfile.proAffiliation.length > 0
      ? 5
      : 0;

  const metadataCompleteness =
    writerNamePoints + writerIpiPoints + publisherPoints + proPoints;

  // ── Placeholders ────────────────────────────────────────────────────────
  const audioQuality = 10;
  const sceneFit = 5;

  // ── Totals and label ────────────────────────────────────────────────────
  const total = rightsAndProvenance + metadataCompleteness + audioQuality + sceneFit;

  const confidenceLabel: "HIGH" | "MEDIUM" | "LOW" =
    total >= 80 ? "HIGH" : total >= 60 ? "MEDIUM" : "LOW";

  // ── Plain-English explanation ────────────────────────────────────────────
  const title = track.title ?? "This track";
  const rightsStatus =
    isrcPoints > 0 ? "ISRC verified" : "ISRC missing or invalid";
  const oneStopStatus =
    oneStopPoints > 0 ? "one-stop clearance confirmed" : "one-stop clearance not confirmed";
  const clearanceSummary =
    total >= 80
      ? "Sync clearance is straightforward."
      : total >= 60
      ? "Sync clearance requires minor follow-up."
      : "Sync clearance requires significant rights investigation.";

  const explanation =
    `${title} scores ${total}/100. ${rightsStatus}. ${oneStopStatus}. ${clearanceSummary}`;

  // ── Deterministic input hash ─────────────────────────────────────────────
  const inputHash = createHash("sha256")
    .update(sortedJson({ track, rightsProfile }))
    .digest("hex");

  const breakdown: ScoreBreakdown = {
    rightsAndProvenance,
    metadataCompleteness,
    audioQuality,
    sceneFit,
    total,
    confidenceLabel,
    explanation,
    detail: {
      isrc: isrcPoints,
      ascapWorkId: ascapPoints,
      masterOwnershipPct: masterPoints,
      isOneStop: oneStopPoints,
      writerName: writerNamePoints,
      writerIpi: writerIpiPoints,
      publisherName: publisherPoints,
      proAffiliation: proPoints,
    },
  };

  return { score: total, breakdown, inputHash };
}
