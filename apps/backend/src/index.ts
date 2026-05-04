import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import scoresRouter from "./routes/scores";
import tracksRouter from "./routes/tracks";
import { startConsumer } from "./queue/consumer";

const app = express();
const port = process.env.PORT ?? 3001;

// CORS — required when frontend and backend run as separate Railway services
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = process.env.CORS_ORIGIN ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

// Larger JSON body cap for /api/tracks/upload — multiple tracks of metadata
app.use(express.json({ limit: "1mb" }));

// Health / test endpoints (Phase 3 diagnostic boundary)
app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", ts: Date.now() });
});
app.get("/test", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use("/api", scoresRouter);
app.use("/api", tracksRouter);

// Global error interceptor — catches any unhandled throw from route handlers
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("GLOBAL ERROR:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_server_error" });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Run the analysis consumer in-process so a single `npm run` boots the
// whole pipeline. The signal/abort plumbing below lets the process exit
// cleanly on SIGINT/SIGTERM rather than orphaning the consumer loop.
const consumerAbort = new AbortController();
startConsumer(consumerAbort.signal).catch((e) => {
  console.error("Consumer crashed:", e);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`Received ${sig}, stopping consumer…`);
    consumerAbort.abort();
    setTimeout(() => process.exit(0), 6_000); // give the BLOCK 5000 a moment to drain
  });
}
