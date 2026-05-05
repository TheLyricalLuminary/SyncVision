import path from 'path';
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

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", ts: Date.now() });
});

app.use("/api", scoresRouter);
app.use("/api", tracksRouter);

app.use("/audio", express.static(path.join(process.cwd(), "apps/backend/audio")));

// Serve Vite production build
const clientDist = path.join(__dirname, "../../frontend/dist");
app.use(express.static(clientDist));

// Catch-all: let React Router handle client-side navigation
app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

// Global error interceptor — catches any unhandled throw from route handlers
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("GLOBAL ERROR:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_server_error" });
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
