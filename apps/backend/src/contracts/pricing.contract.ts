// Canonical pricing contract — ONLY source of truth for plan data.
//
// Rules:
//   - Every plan field is defined here. Nothing is duplicated elsewhere.
//   - stripePriceIdEnvVar names the env var that holds the pre-created Price ID.
//     If the env var is unset, inline price_data is used instead (dev/test safe).
//   - planLevel maps each commercial plan to its feature tier (planLevel.ts).
//   - highlight marks the "most popular" plan rendered in the UI.
//
// To add a plan: add one entry here. No other file needs to change.
// To change pricing: change priceCents here. Stripe checkout derives from it.

import { z } from "zod";
import type { PlanLevel } from "../lib/planLevel";

export const PlanSchema = z.object({
  id:                  z.string(),
  name:                z.string(),
  priceCents:          z.number().int().positive(),
  interval:            z.enum(["month", "year"]),
  description:         z.string(),
  features:            z.array(z.string()),
  planLevel:           z.string() as z.ZodType<PlanLevel>,
  highlight:           z.boolean(),
  stripePriceIdEnvVar: z.string().optional(),
});

export const PricingContractSchema = z.object({
  plans: z.array(PlanSchema),
});

export type Plan            = z.infer<typeof PlanSchema>;
export type PricingContract = z.infer<typeof PricingContractSchema>;

// ─── Canonical plan data ──────────────────────────────────────────────────────

const RAW_PLANS: Plan[] = [
  {
    id:                  "starter",
    name:                "Starter",
    priceCents:          14900,
    interval:            "month",
    description:         "For independent supervisors and small libraries.",
    features: [
      "Up to 100 tracks",
      "Rights state machine evaluation",
      "Scene fit scoring (20 briefs)",
      "Deterministic audit hash",
      "Export CSV",
    ],
    planLevel:           "SUPERVISOR",
    highlight:           false,
    stripePriceIdEnvVar: "STRIPE_PRICE_STARTER",
  },
  {
    id:                  "pro",
    name:                "Pro",
    priceCents:          29900,
    interval:            "month",
    description:         "For working music supervisors handling multiple projects.",
    features: [
      "Up to 500 tracks",
      "Everything in Starter",
      "Confidence score ranking",
      "ROI calculator",
      "Priority support",
    ],
    planLevel:           "SUPERVISOR",
    highlight:           true,
    stripePriceIdEnvVar: "STRIPE_PRICE_PRO",
  },
  {
    id:                  "studio",
    name:                "Studio",
    priceCents:          49900,
    interval:            "month",
    description:         "For production companies and boutique agencies.",
    features: [
      "Up to 2,000 tracks",
      "Everything in Pro",
      "Multi-catalog management",
      "Team member access",
      "Rights report export",
    ],
    planLevel:           "AGENCY",
    highlight:           false,
    stripePriceIdEnvVar: "STRIPE_PRICE_STUDIO",
  },
  {
    id:                  "enterprise",
    name:                "Enterprise",
    priceCents:          199900,
    interval:            "month",
    description:         "For major publishers, broadcasters, and studios.",
    features: [
      "Unlimited tracks",
      "Everything in Studio",
      "API access",
      "Dedicated account manager",
      "Custom SLA / SAML SSO",
    ],
    planLevel:           "ENTERPRISE",
    highlight:           false,
    stripePriceIdEnvVar: "STRIPE_PRICE_ENTERPRISE",
  },
];

// Validate at module load — crashes early if contract is malformed.
export const PRICING_CONTRACT: PricingContract = PricingContractSchema.parse({ plans: RAW_PLANS });

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getPlanById(planId: string): Plan | undefined {
  return PRICING_CONTRACT.plans.find((p: Plan) => p.id === planId);
}

export function planIdToPlanLevel(planId: string): PlanLevel | null {
  return getPlanById(planId)?.planLevel ?? null;
}
