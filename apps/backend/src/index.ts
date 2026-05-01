import "dotenv/config";
import express from "express";
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
