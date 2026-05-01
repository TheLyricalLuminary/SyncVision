// Stripe Checkout — SyncVision
//
// POST /api/stripe/checkout  → creates a Stripe Checkout Session and returns { url }
// GET  /api/stripe/plans     → returns the plan catalogue (no Stripe call, pure static)
//
// Plans use inline price_data so no Stripe Dashboard Price IDs are required.
// Switch to pre-created Price IDs by swapping the line_items block below.
//
// Required env vars:
//   STRIPE_SECRET_KEY      — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET  — whsec_... (for POST /api/stripe/webhook)
//   APP_URL                — public URL for success/cancel redirects (default: http://localhost:5174)

import { Router, Request, Response } from "express";
import Stripe from "stripe";

const router = Router();

// Stripe is instantiated lazily so that a missing STRIPE_SECRET_KEY does
// not crash the server on startup — routes return 503 when unconfigured.
let _stripe: InstanceType<typeof Stripe> | null = null;
function getStripe(): InstanceType<typeof Stripe> | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return _stripe;
}

const APP_URL = process.env.APP_URL ?? "http://localhost:5174";

// ─── Plan catalogue ───────────────────────────────────────────────────────────

export interface Plan {
  id:          string;
  name:        string;
  price_cents: number;
  interval:    "month";
  description: string;
  features:    string[];
}

export const PLANS: Plan[] = [
  {
    id:          "starter",
    name:        "Starter",
    price_cents: 14900,
    interval:    "month",
    description: "For independent supervisors and small libraries.",
    features: [
      "Up to 100 tracks",
      "Rights state machine evaluation",
      "Scene fit scoring (20 briefs)",
      "Deterministic audit hash",
      "Export CSV",
    ],
  },
  {
    id:          "pro",
    name:        "Pro",
    price_cents: 29900,
    interval:    "month",
    description: "For working music supervisors handling multiple projects.",
    features: [
      "Up to 500 tracks",
      "Everything in Starter",
      "Confidence score ranking",
      "ROI calculator",
      "Priority support",
    ],
  },
  {
    id:          "studio",
    name:        "Studio",
    price_cents: 49900,
    interval:    "month",
    description: "For production companies and boutique agencies.",
    features: [
      "Up to 2,000 tracks",
      "Everything in Pro",
      "Multi-catalog management",
      "Team member access",
      "API access",
    ],
  },
  {
    id:          "enterprise",
    name:        "Enterprise",
    price_cents: 199900,
    interval:    "month",
    description: "For major publishers, broadcasters, and studios.",
    features: [
      "Unlimited tracks",
      "Everything in Studio",
      "Dedicated account manager",
      "Custom SLA",
      "SAML SSO",
    ],
  },
];

const PLAN_MAP = new Map(PLANS.map((p) => [p.id, p]));

// ─── GET /api/stripe/plans ────────────────────────────────────────────────────

router.get("/stripe/plans", (_req: Request, res: Response) => {
  res.json({ plans: PLANS });
});

// ─── POST /api/stripe/checkout ────────────────────────────────────────────────

router.post("/stripe/checkout", async (req: Request, res: Response) => {
  const { planId, email } = req.body as { planId?: string; email?: string };

  if (!planId) {
    res.status(400).json({ error: "planId is required" });
    return;
  }

  const plan = PLAN_MAP.get(planId);
  if (!plan) {
    res.status(400).json({
      error: `Unknown planId "${planId}". Must be one of: ${PLANS.map((p) => p.id).join(", ")}`,
    });
    return;
  }

  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured (STRIPE_SECRET_KEY missing)" });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode:                 "subscription",
      customer_email:       email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency:    "usd",
            unit_amount: plan.price_cents,
            recurring:   { interval: plan.interval },
            product_data: {
              name:        `SyncVision ${plan.name}`,
              description: plan.description,
            },
          },
        },
      ],
      metadata: { planId: plan.id },
      success_url: `${APP_URL}?checkout=success&plan=${plan.id}`,
      cancel_url:  `${APP_URL}?checkout=cancelled`,
      allow_promotion_codes: true,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("[stripe] checkout session error:", err);
    const msg = err instanceof Error ? err.message : "Stripe session creation failed";
    res.status(500).json({ error: msg });
  }
});

// ─── POST /api/stripe/webhook ─────────────────────────────────────────────────

router.post("/stripe/webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !sig) {
    res.status(400).json({ error: "Webhook secret or signature missing" });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured (STRIPE_SECRET_KEY missing)" });
    return;
  }

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook signature verification failed";
    console.error("[stripe] webhook sig error:", msg);
    res.status(400).json({ error: msg });
    return;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      console.log(`[stripe] checkout.session.completed plan=${session.metadata?.planId} customer=${session.customer}`);
      // TODO: provision plan in User table
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      console.log(`[stripe] subscription cancelled customer=${sub.customer}`);
      // TODO: downgrade plan in User table
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
});

export default router;
