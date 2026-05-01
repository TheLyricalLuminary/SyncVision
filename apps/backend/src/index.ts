import "dotenv/config";
import express from "express";
import scoresRouter from "./routes/scores";
import tracksRouter from "./routes/tracks";
import authRouter from "./routes/auth";
import catalogsRouter from "./routes/catalogs";
import { startConsumer } from "./queue/consumer";
import { attachAuth } from "./middleware/auth";

const app = express();
const port = process.env.PORT ?? 3001;

// Larger JSON body cap for /api/tracks/upload — multiple tracks of metadata
app.use(express.json({ limit: "1mb" }));

// Attach auth context to every request (non-blocking — routes enforce tiers)
app.use(attachAuth);

app.use("/api", authRouter);
app.use("/api", catalogsRouter);
app.use("/api", scoresRouter);
app.use("/api", tracksRouter);

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
