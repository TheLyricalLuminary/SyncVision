/**
 * Plan tier ordering. Higher index = more access.
 * A SUPERVISOR can access everything COMPOSER can, plus more.
 */
export type PlanLevel = "COMPOSER" | "SUPERVISOR" | "AGENCY" | "ENTERPRISE";

const TIER_ORDER: PlanLevel[] = ["COMPOSER", "SUPERVISOR", "AGENCY", "ENTERPRISE"];

export function tierAtLeast(userPlan: string, required: PlanLevel): boolean {
  const userIdx = TIER_ORDER.indexOf(userPlan as PlanLevel);
  const reqIdx  = TIER_ORDER.indexOf(required);
  return userIdx >= reqIdx;
}

/**
 * Feature gates by tier — single source of truth.
 *
 * Tier       | Rights state  | Hash version | Narrative        | Export
 * -----------|---------------|--------------|------------------|--------
 * COMPOSER   | flag-based    | v1           | template strings | —
 * SUPERVISOR | state machine | v2           | full dictionary  | —
 * AGENCY     | + splits      | v2           | + PDF export     | rights report
 * ENTERPRISE | + API access  | v2 + webhook | + audit trail    | all
 */
export const PLAN_GATES = {
  scores:        "COMPOSER",   // GET /api/scores
  sceneScores:   "SUPERVISOR", // GET /api/scores/scene/:id (state machine + v2 + narratives)
  rightsReport:  "AGENCY",     // GET /api/tracks/:id/rights-report
  apiAccess:     "ENTERPRISE", // programmatic/webhook access
} as const satisfies Record<string, PlanLevel>;
