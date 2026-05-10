// Shared Stripe client singleton — single source for all modules.
// Import getStripe() everywhere instead of constructing locally.

import Stripe from "stripe";

type StripeClient = InstanceType<typeof Stripe>;

let _stripe: StripeClient | null = null;

export function getStripe(): StripeClient | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return _stripe;
}
