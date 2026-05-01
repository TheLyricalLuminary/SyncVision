export type RightsState =
  | "INGESTED"
  | "UNVERIFIED"
  | "PARTIALLY_CLEAR"
  | "CLEAR"
  | "BLOCKED";

export interface RightsProfileForState {
  ascapWorkId?:         string | null;
  bmiWorkId?:           string | null;
  isOneStop?:           boolean | null;
  masterOwnershipType?: string | null;
  masterVerifiedAt?:    Date | string | null;
}

/**
 * Pure function — no side effects, no DB access.
 *
 * State precedence (highest to lowest):
 *   BLOCKED         — masterOwnershipType is 'DISPUTED'
 *   CLEAR           — all three CLEAR conditions met
 *   PARTIALLY_CLEAR — 1 or 2 CLEAR conditions met
 *   UNVERIFIED      — profile exists but zero conditions met
 *   INGESTED        — no profile row at all
 */
export function computeRightsState(
  profile: RightsProfileForState | null | undefined
): RightsState {
  if (!profile) return "INGESTED";

  if (profile.masterOwnershipType === "DISPUTED") return "BLOCKED";

  const hasWorkId =
    (typeof profile.ascapWorkId === "string" && profile.ascapWorkId.length > 0) ||
    (typeof profile.bmiWorkId   === "string" && profile.bmiWorkId.length   > 0);

  const hasOneStop = profile.isOneStop === true;

  const hasVerifiedOwnership =
    typeof profile.masterOwnershipType === "string" &&
    profile.masterOwnershipType.length > 0 &&
    profile.masterOwnershipType !== "UNKNOWN" &&
    profile.masterVerifiedAt != null;

  const metCount = [hasWorkId, hasOneStop, hasVerifiedOwnership].filter(Boolean).length;

  if (metCount === 3) return "CLEAR";
  if (metCount >= 1) return "PARTIALLY_CLEAR";
  return "UNVERIFIED";
}

// ---------------------------------------------------------------------------
// Disagreement logging — parallel to existing confidenceLabel badge
// ---------------------------------------------------------------------------

function expectedLabel(state: RightsState): "HIGH" | "MEDIUM" | "LOW" {
  if (state === "CLEAR")           return "HIGH";
  if (state === "PARTIALLY_CLEAR") return "MEDIUM";
  return "LOW"; // INGESTED, UNVERIFIED, BLOCKED
}

/**
 * Logs a warning when the state machine's implied label differs from the
 * existing confidence-score label. Called on every score request.
 * No-op when they agree.
 */
export function logRightsDisagreement(
  trackId: string,
  state: RightsState,
  actualLabel: string
): void {
  const expected = expectedLabel(state);
  if (expected !== actualLabel) {
    console.warn(
      `[rights-state-machine] DISAGREE track=${trackId}` +
      ` state=${state} expected_label=${expected} actual_label=${actualLabel}`
    );
  }
}
