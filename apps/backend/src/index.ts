import express from 'express';
import path from 'path';
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import scoresRouter from "./routes/scores";
import tracksRouter from "./routes/tracks";
import rightsRouter from "./routes/rights";
import stripeRouter from "./routes/stripe";
import { startConsumer } from "./queue/consumer";

const app = express();
const port = process.env.PORT ?? 3001;

// Stripe webhook needs the raw body BEFORE express.json() parses it.
// Mount it on the exact path so only this route gets raw bytes.
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));

// All other routes get JSON parsing
app.use(express.json({ limit: "1mb" }));

app.use("/api", scoresRouter);
app.use("/api", tracksRouter);
app.use("/api", rightsRouter);
app.use("/api", stripeRouter);

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

// Run the analysis consumer only when Redis is available. Missing REDIS_URL
// is normal in dev/staging — routes stay functional without it.
const consumerAbort = new AbortController();

if (process.env.REDIS_URL) {
  startConsumer(consumerAbort.signal).catch((e) => {
    console.error("Consumer crashed:", e);
  });
} else {
  console.warn("REDIS_URL not set — skipping consumer startup");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`Received ${sig}, stopping consumer…`);
    consumerAbort.abort();
    setTimeout(() => process.exit(0), 6_000);
  });
}
app.use('/audio', express.static(path.join(process.cwd(), 'apps/backend/audio')));
