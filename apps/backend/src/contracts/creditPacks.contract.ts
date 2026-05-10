// Credit pack contract — one-time purchase products, NOT subscriptions.
// Each pack tops up creditBalance on User by `credits` units.
//
// To add a pack: add one entry here. No other file needs to change.
// stripePriceIdEnvVar names the env var holding the Stripe Price ID.
// If the env var is unset, inline price_data is used (dev/test safe).

export interface CreditPack {
  id:                  string;
  name:                string;
  credits:             number;
  priceCents:          number;
  stripePriceIdEnvVar: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id:                  "credits_1",
    name:                "Single Track Analysis",
    credits:             1,
    priceCents:          150,
    stripePriceIdEnvVar: "STRIPE_PRICE_CREDITS_1",
  },
  {
    id:                  "credits_12",
    name:                "12-Pack Analysis Credits",
    credits:             12,
    priceCents:          1500,
    stripePriceIdEnvVar: "STRIPE_PRICE_CREDITS_12",
  },
  {
    id:                  "credits_50",
    name:                "50-Pack Analysis Credits",
    credits:             50,
    priceCents:          4900,
    stripePriceIdEnvVar: "STRIPE_PRICE_CREDITS_50",
  },
];

export function getCreditPackById(packId: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === packId);
}

export function resolvePackPriceId(pack: CreditPack): string | null {
  return process.env[pack.stripePriceIdEnvVar] ?? null;
}
