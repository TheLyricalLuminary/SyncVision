import path from 'path';
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import scoresRouter from "./routes/scores";
import tracksRouter from "./routes/tracks";
import rightsRouter from "./routes/rights";
import stripeRouter from "./routes/stripe";
import billingRouter from "./routes/billing";
import trialsRouter from "./routes/trials";
import authRouter from "./routes/auth";
import catalogsRouter from "./routes/catalogs";
import { startConsumer } from "./queue/consumer";
import { startWebhookWorker } from "./queue/webhookWorker";
import { startReconciliationWorker } from "./queue/reconciliationWorker";
import { startReconciliationCron } from "./jobs/stripeReconciliation";
import { attachAuth } from "./middleware/auth";

// Production safety: fail fast if Stripe is unconfigured
if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
  console.error("FATAL: Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
  process.exit(1);
}

const app = express();
const port = process.env.PORT ?? 3001;

// Trust reverse proxy headers (Render, nginx, Cloudflare) when configured.
// Required for correct req.ip and HTTPS protocol detection behind load balancers.
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

// Stripe webhook — single canonical path matching the Stripe dashboard endpoint.
// Must be mounted BEFORE express.json() so the raw body reaches constructEvent().
app.use("/api/webhook/stripe", express.raw({ type: "application/json" }));

// All other routes get JSON parsing
app.use(express.json({ limit: "1mb" }));

// Attach auth context to every request (non-blocking — routes enforce tiers)
app.use(attachAuth);

app.use("/api", authRouter);
app.use("/api", catalogsRouter);
app.use("/api", scoresRouter);
app.use("/api", tracksRouter);
app.use("/api", rightsRouter);
app.use("/api", stripeRouter);
app.use("/api", billingRouter);
app.use("/api", trialsRouter);

// ── JSON catch-all handlers — enforce JSON contract for every response ────────
// Must be registered AFTER all routers so they only fire on unmatched paths.

// 404 — unknown /api route
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "not_found", message: "No matching API route" });
});

// 500 — unhandled error anywhere in the stack
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] unhandled error:", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: "internal_error", message });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Audio analysis consumer — Redis Streams, optional (dev without Redis is fine).
const consumerAbort = new AbortController();

if (process.env.REDIS_URL) {
  startConsumer(consumerAbort.signal).catch((e) => {
    console.error("Consumer crashed:", e);
  });
} else {
  console.warn("REDIS_URL not set — skipping consumer startup");
}

// Stripe webhook worker — BullMQ, also optional without Redis.
// Falls back to inline async dispatch in the HTTP handler when Redis is absent.
const stopWebhookWorker = startWebhookWorker();
const stopReconciliationWorker = startReconciliationWorker();
startReconciliationCron();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    console.log(`Received ${sig}, shutting down…`);
    consumerAbort.abort();
    if (stopWebhookWorker) await stopWebhookWorker();
    if (stopReconciliationWorker) await stopReconciliationWorker();
    setTimeout(() => process.exit(0), 6_000);
  });
}
app.use('/audio', express.static(path.join(process.cwd(), 'apps/backend/audio')));
