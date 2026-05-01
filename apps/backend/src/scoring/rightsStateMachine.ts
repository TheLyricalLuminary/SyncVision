// Deterministic Rights State Machine
// ─────────────────────────────────────────────────────────────────────────────
// All functions are pure. No async. No side effects. No external calls.
// Same input ALWAYS produces identical output and audit hash.
//
// Engine version is bumped whenever transition rules change so that stored
// hashes from prior runs can be invalidated by version comparison.

import { createHash } from "crypto";

export const ENGINE_VERSION = "1.0.0";

// ─── State enum ──────────────────────────────────────────────────────────────

export type RightsState =
  | "INGESTED"        // track present in system; no rights profile attached
  | "UNVERIFIED"      // rights profile attached; no meaningful data filled
  | "PARTIALLY_CLEAR" // some conditions met; incomplete
  | "CLEAR"           // all mandatory conditions met; no conflict
  | "BLOCKED";        // explicit conflict or unknown rights owner

// ─── Input structure ─────────────────────────────────────────────────────────

export interface TrackMetadata {
  isrc: string | null;
  title: string | null;
  artistName: string | null;
}

export interface OwnershipData {
  masterOwnershipPct: number | string | null;  // 0–100
  masterOwnedBy: string | null;
  masterOwnershipType: string | null;
  masterVerificationSource: string | null;
}

export interface PublishingData {
  ascapWorkId: string | null;
  bmiWorkId: string | null;
  writerName: string | null;
  writerIpi: string | null;
  publisherName: string | null;
  proAffiliation: string | null;
}

export interface UsageRightsData {
  isOneStop: boolean | null;
  masterOwnershipSplits: unknown[] | null;
}

export interface TrackEvalInput {
  audio_id: string;
  ingestion_source: string;
  metadata: TrackMetadata;
  ownership: OwnershipData;
  publishing: PublishingData;
  usage_rights: UsageRightsData;
}

// ─── Transition trace ─────────────────────────────────────────────────────────

export interface StateTransition {
  from: RightsState | null;
  to: RightsState;
  rule: string;
  triggered: boolean;
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface AuditHashInput {
  engine_version: string;
  audio_id: string;
  isrc: string | null;
  rights_state: RightsState;
  blocker_codes: string[];
  master_ownership_pct: number | null;
  is_one_stop: boolean | null;
  ascap_work_id: string | null;
  bmi_work_id: string | null;
  writer_ipi: string | null;
  publisher_name: string | null;
}

export interface AuditHashBinding {
  input: AuditHashInput;
  hash: string;
}

export interface RightsEvaluation {
  rights_state: RightsState;
  confidence_score: number;   // 0–1, deterministic from field presence
  blockers: string[];
  clearance_summary: string;
  transition_trace: StateTransition[];
  audit_hash: AuditHashBinding;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isNaN(n) ? null : n;
}

function present(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

// Canonical JSON: all object keys sorted at every depth.
// This is the only correct way to produce a deterministic hash from a JS object.
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

// ─── Rule predicates (all pure) ──────────────────────────────────────────────

function hasRightsProfile(input: TrackEvalInput): boolean {
  const { ownership: o, publishing: p, usage_rights: u } = input;
  return (
    present(o.masterOwnedBy) ||
    present(o.masterOwnershipType) ||
    present(p.ascapWorkId) ||
    present(p.bmiWorkId) ||
    present(p.writerName) ||
    present(p.publisherName) ||
    present(p.proAffiliation) ||
    present(p.writerIpi) ||
    u.isOneStop !== null
  );
}

function hasMasterConflict(ownership: OwnershipData): boolean {
  const pct = toNum(ownership.masterOwnershipPct);
  // Explicit conflict: ownership explicitly 0 with an owner named — disputed
  if (pct !== null && pct <= 0 && present(ownership.masterOwnedBy)) return true;
  return false;
}

function masterVerified(ownership: OwnershipData): boolean {
  const pct = toNum(ownership.masterOwnershipPct);
  return pct !== null && pct === 100;
}

function publishingVerified(publishing: PublishingData): boolean {
  return (
    (present(publishing.ascapWorkId) || present(publishing.bmiWorkId)) &&
    present(publishing.writerName) &&
    present(publishing.publisherName)
  );
}

function hasPartialData(input: TrackEvalInput): boolean {
  const { ownership: o, publishing: p, usage_rights: u } = input;
  return (
    toNum(o.masterOwnershipPct) !== null ||
    present(p.writerName) ||
    present(p.publisherName) ||
    present(p.ascapWorkId) ||
    present(p.bmiWorkId) ||
    present(p.proAffiliation) ||
    u.isOneStop !== null
  );
}

// ─── Blocker codes ────────────────────────────────────────────────────────────

function evaluateBlockers(input: TrackEvalInput): string[] {
  const blockers: string[] = [];
  const { metadata: m, ownership: o, publishing: p, usage_rights: u } = input;

  if (!present(m.isrc))                   blockers.push("ISRC_MISSING");
  if (!present(m.title))                   blockers.push("TITLE_MISSING");
  if (hasMasterConflict(o))               blockers.push("MASTER_OWNERSHIP_CONFLICT");
  if (toNum(o.masterOwnershipPct) === null) blockers.push("MASTER_PCT_UNSET");
  if (!present(p.writerName))             blockers.push("WRITER_UNIDENTIFIED");
  if (!present(p.writerIpi))              blockers.push("WRITER_IPI_MISSING");
  if (!present(p.publisherName))          blockers.push("PUBLISHER_UNKNOWN");
  if (!present(p.ascapWorkId) && !present(p.bmiWorkId))
                                           blockers.push("PRO_WORK_ID_MISSING");
  if (u.isOneStop !== true)               blockers.push("ONE_STOP_NOT_CONFIRMED");

  return blockers;
}

// ─── Confidence score (pure, 0–1) ────────────────────────────────────────────
// Fraction of the nine mandatory clearance conditions that are satisfied.

function evaluateConfidenceScore(input: TrackEvalInput): number {
  const { metadata: m, ownership: o, publishing: p, usage_rights: u } = input;
  const checks = [
    present(m.isrc),
    present(m.title),
    !hasMasterConflict(o),
    masterVerified(o),
    present(p.writerName),
    present(p.writerIpi),
    present(p.publisherName),
    present(p.ascapWorkId) || present(p.bmiWorkId),
    u.isOneStop === true,
  ];
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100) / 100;
}

// ─── State machine (deterministic transition table) ──────────────────────────

export function evaluateRightsState(input: TrackEvalInput): {
  state: RightsState;
  trace: StateTransition[];
} {
  const trace: StateTransition[] = [];

  // Rule 1: No rights profile → INGESTED
  const rule1 = !hasRightsProfile(input);
  trace.push({
    from: null,
    to: "INGESTED",
    rule: "NO_RIGHTS_PROFILE: rights profile absent or all fields null",
    triggered: rule1,
  });
  if (rule1) return { state: "INGESTED", trace };

  // Rule 2: Master conflict → BLOCKED
  const rule2 = hasMasterConflict(input.ownership);
  trace.push({
    from: "INGESTED",
    to: "BLOCKED",
    rule: "MASTER_CONFLICT: masterOwnershipPct ≤ 0 with named owner (disputed)",
    triggered: rule2,
  });
  if (rule2) return { state: "BLOCKED", trace };

  // Rule 3: Publisher unknown with no PRO ID and no writer IPI → BLOCKED
  const rule3 =
    !present(input.publishing.publisherName) &&
    !present(input.publishing.ascapWorkId) &&
    !present(input.publishing.bmiWorkId) &&
    !present(input.publishing.writerIpi) &&
    hasPartialData(input); // profile exists but publishing is a blank wall
  trace.push({
    from: "INGESTED",
    to: "BLOCKED",
    rule: "UNKNOWN_RIGHTS_OWNER: publisher and PRO IDs both absent despite partial rights data",
    triggered: rule3,
  });
  if (rule3) return { state: "BLOCKED", trace };

  // Rule 4: All clearance conditions met → CLEAR
  const rule4 =
    masterVerified(input.ownership) &&
    publishingVerified(input.publishing) &&
    present(input.publishing.writerIpi) &&
    input.usage_rights.isOneStop === true &&
    present(input.metadata.isrc);
  trace.push({
    from: "INGESTED",
    to: "CLEAR",
    rule: "ALL_CLEAR: masterOwnershipPct=100, PRO Work ID, writerIpi, publisherName, isOneStop=true, ISRC",
    triggered: rule4,
  });
  if (rule4) return { state: "CLEAR", trace };

  // Rule 5: Has some data but not enough for CLEAR → PARTIALLY_CLEAR
  const rule5 = hasPartialData(input);
  trace.push({
    from: "INGESTED",
    to: "PARTIALLY_CLEAR",
    rule: "PARTIAL_DATA: some clearance fields present but requirements incomplete",
    triggered: rule5,
  });
  if (rule5) return { state: "PARTIALLY_CLEAR", trace };

  // Rule 6: Rights profile present but completely empty → UNVERIFIED
  trace.push({
    from: "INGESTED",
    to: "UNVERIFIED",
    rule: "EMPTY_PROFILE: rights profile exists with no actionable field values",
    triggered: true,
  });
  return { state: "UNVERIFIED", trace };
}

// ─── Clearance summary (machine-generated, deterministic) ────────────────────

function buildClearanceSummary(
  state: RightsState,
  blockers: string[],
  input: TrackEvalInput,
): string {
  const title = input.metadata.title ?? input.audio_id;
  const isrc = input.metadata.isrc ?? "ISRC_UNKNOWN";

  switch (state) {
    case "CLEAR":
      return (
        `${title} [${isrc}]: CLEAR. ` +
        `Master ownership 100% verified. ` +
        `One-stop confirmed. ` +
        `PRO registration present. ` +
        `Writer and publisher identified. ` +
        `0 blockers.`
      );
    case "PARTIALLY_CLEAR":
      return (
        `${title} [${isrc}]: PARTIALLY_CLEAR. ` +
        `${blockers.length} unresolved blocker(s): ${blockers.join(", ")}. ` +
        `Clearance requires follow-up on missing fields before placement.`
      );
    case "BLOCKED":
      return (
        `${title} [${isrc}]: BLOCKED. ` +
        `Rights conflict or unknown rights owner detected. ` +
        `Blockers: ${blockers.join(", ")}. ` +
        `Track is not cleared. Legal review required.`
      );
    case "UNVERIFIED":
      return (
        `${title} [${isrc}]: UNVERIFIED. ` +
        `Rights profile is present but all fields are empty. ` +
        `No clearance determination possible without data.`
      );
    case "INGESTED":
      return (
        `${title} [${isrc}]: INGESTED. ` +
        `No rights profile attached. ` +
        `Track cannot be evaluated until rights data is submitted.`
      );
  }
}

// ─── Audit hash ───────────────────────────────────────────────────────────────

function buildAuditHash(
  input: TrackEvalInput,
  state: RightsState,
  blockers: string[],
): AuditHashBinding {
  const hashInput: AuditHashInput = {
    engine_version:      ENGINE_VERSION,
    audio_id:            input.audio_id,
    isrc:                input.metadata.isrc,
    rights_state:        state,
    blocker_codes:       [...blockers].sort(), // sorted for determinism
    master_ownership_pct: toNum(input.ownership.masterOwnershipPct),
    is_one_stop:         input.usage_rights.isOneStop,
    ascap_work_id:       input.publishing.ascapWorkId,
    bmi_work_id:         input.publishing.bmiWorkId,
    writer_ipi:          input.publishing.writerIpi,
    publisher_name:      input.publishing.publisherName,
  };

  const hash = createHash("sha256")
    .update(sortedJson(hashInput))
    .digest("hex");

  return { input: hashInput, hash };
}

// ─── Main evaluator (pure, top-level export) ─────────────────────────────────

export function evaluateTrack(input: TrackEvalInput): RightsEvaluation {
  const { state, trace }    = evaluateRightsState(input);
  const blockers             = evaluateBlockers(input);
  const confidence_score     = evaluateConfidenceScore(input);
  const clearance_summary    = buildClearanceSummary(state, blockers, input);
  const audit_hash           = buildAuditHash(input, state, blockers);

  return {
    rights_state:     state,
    confidence_score,
    blockers,
    clearance_summary,
    transition_trace: trace,
    audit_hash,
  };
}
