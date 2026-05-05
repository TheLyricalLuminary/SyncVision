import express from 'express';
import path from 'path';
import "dotenv/config";
import express from "express";
import scoresRouter from "./routes/scores";
import tracksRouter from "./routes/tracks";
import { startConsumer } from "./queue/consumer";

const app = express();
const port = process.env.PORT ?? 3001;

// Larger JSON body cap for /api/tracks/upload — multiple tracks of metadata
app.use(express.json({ limit: "1mb" }));

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
app.use('/audio', express.static(path.join(process.cwd(), 'apps/backend/audio')));
