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
import redis from "../lib/redis";
import { getStripe } from "../lib/stripe";
import { webhookQueue } from "../queue/webhookQueue";
import { dispatchEvent } from "../queue/webhookHandlers";
import { auditLog } from "../lib/auditLog";
import { getApiPlans, getPlanForCheckout, resolveStripePriceId } from "../lib/pricingAdapter";
import { CREDIT_PACKS, getCreditPackById, resolvePackPriceId } from "../contracts/creditPacks.contract";

const router = Router();

const CONFIGURED_URL = process.env.FRONTEND_URL ?? "http://localhost:5174";
const APP_URL = CONFIGURED_URL.includes("localhost")
  ? "https://music-sync-rights-platform.onrender.com"
  : CONFIGURED_URL;

// ─── GET /api/stripe/plans ────────────────────────────────────────────────────

router.get("/stripe/plans", (_req: Request, res: Response) => {
  res.json({ plans: getApiPlans() });
});

// ─── POST /api/stripe/checkout ────────────────────────────────────────────────

router.post("/stripe/checkout", async (req: Request, res: Response) => {
  const { planId, email } = req.body as { planId?: string; email?: string };

  if (!planId) {
    res.status(400).json({ error: "planId is required" });
    return;
  }

  let plan;
  try {
    plan = getPlanForCheckout(planId);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid planId" });
    return;
  }

  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured (STRIPE_SECRET_KEY missing)" });
    return;
  }

  const auth = (req as any).auth as { userId?: string } | undefined;
  const userId = auth?.userId;

  try {
    const priceId = resolveStripePriceId(plan);

    const lineItem = priceId
      ? { price: priceId, quantity: 1 as const }
      : {
          quantity: 1 as const,
          price_data: {
            currency:    "usd",
            unit_amount: plan.priceCents,
            recurring:   { interval: plan.interval },
            product_data: {
              name:        `SyncVision ${plan.name}`,
              description: plan.description,
            },
          },
        };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode:                 "subscription",
      customer_email:       email ?? undefined,
      line_items:           [lineItem],
      metadata: {
        planId: plan.id,
        ...(userId ? { userId } : {}),
      },
      success_url:          `${APP_URL}?checkout=success&plan=${plan.id}`,
      cancel_url:           `${APP_URL}?checkout=cancelled`,
      allow_promotion_codes: true,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("[stripe] checkout session error:", err);
    const msg = err instanceof Error ? err.message : "Stripe session creation failed";
    res.status(500).json({ error: msg });
  }
});

// ─── GET /api/stripe/credit-packs ────────────────────────────────────────────

router.get("/stripe/credit-packs", (_req: Request, res: Response) => {
  res.json({
    packs: CREDIT_PACKS.map((p) => ({
      id:          p.id,
      name:        p.name,
      credits:     p.credits,
      price_cents: p.priceCents,
    })),
  });
});

// ─── POST /api/stripe/checkout/credits ───────────────────────────────────────

router.post("/stripe/checkout/credits", async (req: Request, res: Response) => {
  const { packId, email } = req.body as { packId?: string; email?: string };

  if (!packId) {
    res.status(400).json({ error: "packId is required" });
    return;
  }

  const pack = getCreditPackById(packId);
  if (!pack) {
    const valid = CREDIT_PACKS.map((p) => p.id).join(", ");
    res.status(400).json({ error: `Unknown packId "${packId}". Valid IDs: ${valid}` });
    return;
  }

  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured (STRIPE_SECRET_KEY missing)" });
    return;
  }

  const auth   = (req as any).auth as { userId?: string } | undefined;
  const userId = auth?.userId;

  try {
    const priceId = resolvePackPriceId(pack);

    const lineItem = priceId
      ? { price: priceId, quantity: 1 as const }
      : {
          quantity: 1 as const,
          price_data: {
            currency:    "usd",
            unit_amount: pack.priceCents,
            product_data: { name: pack.name },
          },
        };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode:                 "payment",
      customer_email:       email ?? undefined,
      line_items:           [lineItem],
      metadata: {
        packId:  pack.id,
        credits: String(pack.credits),
        ...(userId ? { userId } : {}),
      },
      success_url: `${APP_URL}?checkout=success&pack=${pack.id}`,
      cancel_url:  `${APP_URL}?checkout=cancelled`,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("[stripe] credit checkout session error:", err);
    const msg = err instanceof Error ? err.message : "Stripe session creation failed";
    res.status(500).json({ error: msg });
  }
});

// ─── POST /api/webhook/stripe — SINGLE canonical ingress ─────────────────────
//
// INGESTION ONLY. No DB writes. No entitlement mutation. No business logic.
//
//   Phase 1 — Verify:     constructEvent() validates signature + timestamp (±300 s)
//   Phase 2 — Redis dedup: atomic SET NX — first writer wins, O(1) race-safe
//   Phase 3 — DB ledger:  stripe_events PK — durable dedup if Redis TTL expires
//   Phase 4 — Enqueue:    webhookQueue (BullMQ, 5 attempts, exponential backoff)
//   Phase 5 — ACK fast:   200 before any fulfillment work
//
// If Redis/BullMQ is unavailable (dev without Redis), falls back to inline
// async dispatch via setImmediate so the HTTP contract is unchanged.

router.post("/webhook/stripe", async (req: Request, res: Response): Promise<void> => {
  const sig    = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !sig) {
    res.status(400).json({ error: "Webhook secret or signature missing" });
    return;
  }

  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured" });
    return;
  }

  // Phase 1 — Signature + timestamp (constructEvent enforces ±300 s)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    console.error("[stripe/webhook] sig error:", msg);
    res.status(400).json({ error: msg });
    return;
  }

  // Phase 2 — Redis idempotency: atomic SET NX (7-day TTL)
  // Single atomic command — no race window between check and mark.
  if (redis) {
    const key   = `stripe:event:${event.id}`;
    const isNew = await redis.set(key, "1", "EX", 604800, "NX");
    if (!isNew) {
      await auditLog("WEBHOOK_DUPLICATE", "SKIPPED", { eventId: event.id, type: event.type, layer: "redis", tag: "[STRIPE_DUPLICATE]" }, event.id);
      console.log(`[STRIPE_DUPLICATE] Redis dedup: ${event.id} (${event.type})`);
      res.status(200).json({ received: true });
      return;
    }
  }

  await auditLog("WEBHOOK_ENQUEUED", "OK", { eventId: event.id, type: event.type, tag: "[STRIPE_RECON]" }, event.id);

  // Phase 3 — Enqueue to BullMQ (ONLY). No DB writes in the HTTP handler.
  // The worker writes to StripeEventLedger after it dequeues.
  const jobPayload = { id: event.id, type: event.type, data: event.data };
  const jobOptions = {
    attempts:         5,
    backoff:          { type: "exponential" as const, delay: 2000 },
    removeOnComplete: true,
    removeOnFail:     false,
  };

  if (webhookQueue) {
    await webhookQueue.add(event.type, jobPayload, jobOptions);
  } else {
    // Fallback: no Redis — dispatch inline after HTTP response flushes.
    // Handler is idempotent so this is safe on retry.
    setImmediate(() =>
      dispatchEvent(event.type, event.data, event.id, "webhook").catch((err) =>
        console.error(`[stripe/webhook] inline fallback error event=${event.id}:`, err)
      )
    );
  }

  // Phase 4 — ACK immediately. Job committed to queue before response.
  res.status(200).json({ received: true });
});

export default router;
