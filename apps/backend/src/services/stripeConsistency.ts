// Stripe ↔ local DB consistency validation and auto-repair.
//
// validateStripeState(userId) compares the user's local planLevel against
// their live Stripe subscription state and returns a drift descriptor.
//
// repairDrift() applies the minimum idempotent mutation to bring local state
// into agreement with Stripe (the billing source of truth).

import prisma from "../lib/prisma";
import { getStripe } from "../lib/stripe";
import { auditLog } from "../lib/auditLog";

export type DriftType =
  | "no_stripe_customer"
  | "stripe_unavailable"
  | "user_not_found"
  | "stripe_paid_local_unpaid"
  | "stripe_canceled_local_paid"
  | "price_mismatch"
  | "consistent";

export interface ConsistencyResult {
  consistent:  boolean | null;   // null = cannot determine
  driftType:   DriftType;
  userId:      string;
  localState:  { planLevel: string; stripeCustomerId?: string | null };
  stripeState: { activeSubscriptions: number; priceIds: string[] } | null;
}

export async function validateStripeState(userId: string): Promise<ConsistencyResult> {
  // ── 1. Fetch local user ─────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return {
      consistent: false, driftType: "user_not_found",
      userId, localState: { planLevel: "UNKNOWN" }, stripeState: null,
    };
  }

  const localState = { planLevel: user.planLevel, stripeCustomerId: user.stripeCustomerId };

  if (!user.stripeCustomerId) {
    return { consistent: null, driftType: "no_stripe_customer", userId, localState, stripeState: null };
  }

  // ── 2. Fetch Stripe subscriptions ───────────────────────────────────────────
  const stripe = getStripe();
  if (!stripe) {
    return { consistent: null, driftType: "stripe_unavailable", userId, localState, stripeState: null };
  }

  const subs = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    status:   "active",
    limit:    10,
  });

  const priceIds = subs.data.flatMap((s: { items: { data: Array<{ price: { id: string } }> } }) =>
    s.items.data.map((i: { price: { id: string } }) => i.price.id)
  );

  const stripeState = { activeSubscriptions: subs.data.length, priceIds };
  const hasActiveSub = subs.data.length > 0;
  const localIsPaid  = user.planLevel === "PAID";

  // ── 3. Detect drift ─────────────────────────────────────────────────────────
  if (hasActiveSub && !localIsPaid) {
    return { consistent: false, driftType: "stripe_paid_local_unpaid",  userId, localState, stripeState };
  }
  if (!hasActiveSub && localIsPaid) {
    return { consistent: false, driftType: "stripe_canceled_local_paid", userId, localState, stripeState };
  }

  return { consistent: true, driftType: "consistent", userId, localState, stripeState };
}

// Repair detected drift — idempotent, audit-logged.
export async function repairDrift(result: ConsistencyResult): Promise<void> {
  const { userId, driftType, stripeState } = result;

  if (result.consistent !== false) return;

  if (driftType === "stripe_paid_local_unpaid") {
    const updated = await prisma.user.updateMany({
      where: { id: userId, planLevel: { not: "PAID" } },
      data:  { planLevel: "PAID" },
    });

    const action = updated.count > 0 ? "ENTITLEMENT_UPGRADED" : "ENTITLEMENT_NOOP";
    await auditLog(action, updated.count > 0 ? "OK" : "NOOP", {
      userId, driftType, stripeState,
      tag: "[STRIPE_REPAIR]",
    });

    console.log(`[STRIPE_REPAIR] userId=${userId} drift=${driftType} action=${action}`);
    return;
  }

  if (driftType === "stripe_canceled_local_paid") {
    const updated = await prisma.user.updateMany({
      where: { id: userId, planLevel: "PAID" },
      data:  { planLevel: "COMPOSER" },
    });

    const action = updated.count > 0 ? "ENTITLEMENT_DOWNGRADED" : "ENTITLEMENT_NOOP";
    await auditLog(action, updated.count > 0 ? "OK" : "NOOP", {
      userId, driftType, stripeState,
      tag: "[STRIPE_REPAIR]",
    });

    console.log(`[STRIPE_REPAIR] userId=${userId} drift=${driftType} action=${action}`);
  }
}
