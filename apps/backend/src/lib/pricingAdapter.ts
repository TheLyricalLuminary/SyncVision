// Derives Stripe checkout parameters and API response shapes from the pricing contract.
// No pricing values are defined here — all come from pricing.contract.ts.

import { PRICING_CONTRACT, getPlanById } from "../contracts/pricing.contract";
import type { Plan } from "../contracts/pricing.contract";

// Shape returned by GET /api/stripe/plans
export interface ApiPlan {
  id:          string;
  name:        string;
  price_cents: number;
  interval:    "month" | "year";
  description: string;
  features:    string[];
  highlight:   boolean;
}

export function getApiPlans(): ApiPlan[] {
  return PRICING_CONTRACT.plans.map((p: Plan) => ({
    id:          p.id,
    name:        p.name,
    price_cents: p.priceCents,
    interval:    p.interval,
    description: p.description,
    features:    p.features,
    highlight:   p.highlight,
  }));
}

// Resolves the Stripe Price ID for a plan.
// Returns the pre-created Price ID from env if set; otherwise returns null
// and the caller should use inline price_data.
export function resolveStripePriceId(plan: Plan): string | null {
  if (!plan.stripePriceIdEnvVar) return null;
  return process.env[plan.stripePriceIdEnvVar] ?? null;
}

export function getPlanForCheckout(planId: string): Plan {
  const plan = getPlanById(planId);
  if (!plan) {
    throw new Error(`Unknown planId "${planId}". Valid IDs: ${PRICING_CONTRACT.plans.map((p: Plan) => p.id).join(", ")}`);
  }
  return plan;
}
