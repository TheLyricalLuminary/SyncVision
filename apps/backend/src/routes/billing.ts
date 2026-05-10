import { Router, Request, Response } from "express";
import Stripe from "stripe";
import prisma from "../lib/prisma";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16" as any,
});

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

// POST /api/billing/checkout — legacy per-userId checkout (userId in body)
// New flows should use POST /api/stripe/checkout with planId + email.
router.post("/billing/checkout", async (req: Request, res: Response) => {
  const { userId } = req.body;

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } }).catch(() => null);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "SyncVision Pro Subscription",
              description: "Full access to ingestion and scoring features",
            },
            unit_amount: 2900,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      metadata: { userId },
      customer_email: user.email,
      success_url: `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/billing/cancel`,
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error("[billing] checkout error:", error);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

export default router;
