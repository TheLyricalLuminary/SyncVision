import path from 'path';
import fs from 'fs';
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { assertRuntimeCoherency } from "./runtime/buildFingerprint";
import scoresRouter from "./routes/scores";
import tracksRouter from "./routes/tracks";
import rightsRouter from "./routes/rights";
import fingerprintRouter from "./routes/fingerprint";
import stripeRouter from "./routes/stripe";
import billingRouter from "./routes/billing";
import trialsRouter from "./routes/trials";
import authRouter from "./routes/auth";
import catalogsRouter from "./routes/catalogs";
import demoRouter from "./routes/demo";
import analysisRouter from "./routes/analysis";
import arcRouter from "./routes/arc";
import songArcRouter from "./routes/songArc";
import composerReportRouter from "./routes/composerReport";
import shareRouter from "./routes/share";
import debugRouter from "./routes/debug";
import mirrorRouter from "./routes/mirror";
import catalogRouter from "./routes/catalog";
import { startConsumer } from "./queue/consumer";
import { startWebhookWorker } from "./queue/webhookWorker";
import { startReconciliationWorker } from "./queue/reconciliationWorker";
import { startReconciliationCron } from "./jobs/stripeReconciliation";
import { attachAuth } from "./middleware/auth";

assertRuntimeCoherency();

const REQUIRED_ENV = [
  "DATABASE_URL",
  "JWT_SECRET",
  "FRONTEND_URL",
  "AUDIO_STORAGE_PATH",
  "AUDIO_TOKEN_SECRET",
];

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  throw new Error(
    `[STARTUP ABORTED] Missing required environment variables: ${missing.join(", ")}`
  );
}

const app = express();
const port = process.env.PORT ?? 3000;

// Trust reverse proxy headers (Railway, nginx, Cloudflare) when configured.
// Required for correct req.ip and HTTPS protocol detection behind load balancers.
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

// CORS — allow the configured production frontend origin.
// Set FRONTEND_URL to the Railway frontend public URL in production.
// Additional origins can be added via EXTRA_ALLOWED_ORIGINS (comma-separated).
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.EXTRA_ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean),
].filter(Boolean) as string[];

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
  }
  next();
});

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
app.use("/api", fingerprintRouter);
app.use("/api", stripeRouter);
app.use("/api", billingRouter);
app.use("/api", trialsRouter);
app.use("/api", composerReportRouter);
app.use("/api", shareRouter);
app.use("/api", demoRouter);
app.use("/api", analysisRouter);
app.use("/api", arcRouter);
app.use("/api", songArcRouter);
app.use("/api", debugRouter);
app.use("/api", mirrorRouter);
app.use("/api", catalogRouter);

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

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

app.use(
  "/audio",
  express.static(
    process.env.AUDIO_STORAGE_PATH ?? path.resolve(__dirname, "../audio")
  )
);

// Serve Vite production build only when the dist directory is present.
// In backend-only deployments the frontend is served as a separate Railway service.
const clientDist = path.join(__dirname, "../../frontend/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("/{*path}", (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Global error interceptor — catches any unhandled throw from route handlers
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("GLOBAL ERROR:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_server_error" });
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

// Keep-alive ping — prevents Render free-tier cold starts during active outreach.
// Set KEEP_ALIVE_URL to the backend /health URL to enable; omit to skip.
if (process.env.KEEP_ALIVE_URL) {
  const keepAliveUrl = process.env.KEEP_ALIVE_URL;
  console.log(`[keep-alive] pinging ${keepAliveUrl} every 10 minutes`);
  setInterval(() => {
    fetch(keepAliveUrl).catch((e) => console.warn("[keep-alive] ping failed:", e));
  }, 10 * 60 * 1000);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    console.log(`Received ${sig}, shutting down…`);
    consumerAbort.abort();
    if (stopWebhookWorker) await stopWebhookWorker();
    if (stopReconciliationWorker) await stopReconciliationWorker();
    setTimeout(() => process.exit(0), 6_000);
  });
}
