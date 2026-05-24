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
  bmiWorkId?: string | null;
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
  audioQuality: number; // 0–10, based on actual audio feature presence
  sceneFit: number; // 0–5, PAD versatility (distance from emotional centre, inverted)
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

  // ── Audio Analysis Quality (0–10) ───────────────────────────────────────
  // Points awarded for actual audio feature presence, not field placeholders.
  //   +4  tempo detected
  //   +3  tonal character classified
  //   +3  spectral centroid AND rms energy measured
  const hasTempo =
    typeof track.tempo === "number" && !isNaN(track.tempo as number);
  const hasTonal =
    typeof track.tonalCharacter === "string" &&
    (track.tonalCharacter as string).length > 0;
  const hasSpectral =
    typeof track.spectralCentroid === "number" &&
    !isNaN(track.spectralCentroid as number) &&
    typeof track.rmsEnergy === "number" &&
    !isNaN(track.rmsEnergy as number);

  const audioQuality =
    (hasTempo ? 4 : 0) + (hasTonal ? 3 : 0) + (hasSpectral ? 3 : 0);

  // ── PAD Versatility (0–5) ────────────────────────────────────────────────
  // Measures how emotionally centred the track is across the PAD cube.
  // A mean PAD of [0.5, 0.5, 0.5] is maximally versatile (useful for any
  // brief); extreme emotional profiles score lower.
  // Max distance from centre to any corner = sqrt(3)/2 ≈ 0.866.
  let sceneFit = 0;
  const timeline = Array.isArray(track.timeline)
    ? (track.timeline as number[][])
    : null;
  if (timeline && timeline.length > 0) {
    let vSum = 0, aSum = 0, dSum = 0;
    for (const row of timeline) {
      vSum += row[0] ?? 0;
      aSum += row[1] ?? 0;
      dSum += row[3] ?? 0;
    }
    const n = timeline.length;
    const dv = vSum / n - 0.5;
    const da = aSum / n - 0.5;
    const dd = dSum / n - 0.5;
    const distFromCentre = Math.sqrt(dv * dv + da * da + dd * dd);
    const maxDist = Math.sqrt(3) / 2;
    sceneFit = Math.round((1 - Math.min(1, distFromCentre / maxDist)) * 5);
  }

  // ── Totals and label ────────────────────────────────────────────────────
  const total = rightsAndProvenance + metadataCompleteness + audioQuality + sceneFit;

  const confidenceLabel: "HIGH" | "MEDIUM" | "LOW" =
    total >= 80 ? "HIGH" : total >= 60 ? "MEDIUM" : "LOW";

  // ── Plain-English explanation ────────────────────────────────────────────
  const title = track.title ?? "This track";

  // Musical character sentence — only when audio features are present
  const audioDesc: string[] = [];
  if (track.tonalCharacter) audioDesc.push(track.tonalCharacter as string);
  if (track.energyCharacter) audioDesc.push(track.energyCharacter as string);
  if (typeof track.tempo === "number" && !isNaN(track.tempo as number))
    audioDesc.push(`${Math.round(track.tempo as number)} BPM`);
  const audioSentence = audioDesc.length > 0
    ? `Character: ${audioDesc.join(", ")}.`
    : "";

  const clearanceSummary =
    total >= 80
      ? "Sync clearance is straightforward."
      : total >= 60
      ? "Sync clearance requires minor follow-up."
      : "Sync clearance requires rights investigation.";

  const explanation = [
    audioSentence,
    clearanceSummary,
    oneStopPoints > 0 ? "One-stop confirmed." : "One-stop not confirmed.",
  ].filter(Boolean).join(" ");

  // ── Deterministic input hash ─────────────────────────────────────────────
  // Only hash the fields the scoring function actually reads. Excluding
  // trackStatus, updatedAt, and other worker-written fields prevents false
  // mismatch errors when those fields change after the score is first written.
  const stableInputs = {
    isrc: track.isrc ?? null,
    title: track.title ?? null,
    tempo: (track.tempo ?? null) as number | null,
    tonalCharacter: (track.tonalCharacter ?? null) as string | null,
    energyCharacter: (track.energyCharacter ?? null) as string | null,
    spectralCentroid: (track.spectralCentroid ?? null) as number | null,
    rmsEnergy: (track.rmsEnergy ?? null) as number | null,
    hasTimeline: Array.isArray(track.timeline) && (track.timeline as unknown[]).length > 0,
    rightsProfile: {
      ascapWorkId: rightsProfile.ascapWorkId ?? null,
      masterOwnershipPct: toNumber(rightsProfile.masterOwnershipPct),
      isOneStop: rightsProfile.isOneStop ?? null,
      writerName: rightsProfile.writerName ?? null,
      writerIpi: rightsProfile.writerIpi ?? null,
      publisherName: rightsProfile.publisherName ?? null,
      proAffiliation: rightsProfile.proAffiliation ?? null,
    },
  };

  const inputHash = createHash("sha256")
    .update(sortedJson(stableInputs))
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
