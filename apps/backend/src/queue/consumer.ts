import "dotenv/config";
import path from "path";
import { spawn } from "child_process";
import Redis from "ioredis";
import prisma from "../lib/prisma";

const STREAM = "syncvision:analysis";
const GROUP = "workers";
const CONSUMER = "consumer-1";

// Resolve analyze.py relative to this file: src/queue → apps/worker
const WORKER_SCRIPT = path.resolve(__dirname, "../../../worker/analyze.py");

function parseFields(flat: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out[flat[i]] = flat[i + 1];
  }
  return out;
}

function runWorker(audioFilePath: string): Promise<{ success: true; data: unknown } | { success: false; error: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const pythonBin = process.env.PYTHON_BIN || "python3";
    const proc = spawn(pythonBin, [WORKER_SCRIPT, audioFilePath]);

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));

    proc.on("close", (code) => {
      if (code === 0) {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolve({ success: true, data });
        } catch (e) {
          resolve({ success: false, error: `JSON parse failed: ${e}` });
        }
      } else {
        resolve({ success: false, error: Buffer.concat(errChunks).toString("utf8").trim() });
      }
    });

    proc.on("error", (e) => resolve({ success: false, error: e.message }));
  });
}

export async function startConsumer(signal?: AbortSignal): Promise<void> {
  // Use a dedicated ioredis client so we can disconnect cleanly on stop
  const redis = new Redis(process.env.REDIS_URL!);

  // Create consumer group (MKSTREAM creates the stream if absent)
  try {
    await redis.xgroup("CREATE", STREAM, GROUP, "$", "MKSTREAM");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("BUSYGROUP")) throw e;
  }

  try {
    while (!signal?.aborted) {
      // Block up to 5 s waiting for new messages
      const result = await redis.xreadgroup(
        "GROUP", GROUP, CONSUMER,
        "COUNT", "1",
        "BLOCK", "5000",
        "STREAMS", STREAM, ">"
      ) as Array<[string, Array<[string, string[]]>]> | null;

      if (!result || result.length === 0) continue;

      const [, messages] = result[0];

      for (const [msgId, flatFields] of messages) {
        const fields = parseFields(flatFields);
        const { trackId } = fields;

        const track = await prisma.track.findUnique({ where: { id: trackId } });

        if (!track) {
          console.error(`Consumer: track ${trackId} not found, acking and skipping`);
          await redis.xack(STREAM, GROUP, msgId);
          continue;
        }

        // Idempotency: already terminal, nothing to do
        if (track.trackStatus === "analyzed" || track.trackStatus === "failed") {
          await redis.xack(STREAM, GROUP, msgId);
          continue;
        }

        // Fail loudly on missing audio path. A placeholder fallback would produce
        // real-looking scores from fake input — that is fraudulent output.
        if (!track.audioFilePath) {
          console.error(
            `Consumer: track ${trackId} has null audioFilePath — cannot process track without a real audio file`
          );
          await prisma.track.update({ where: { id: trackId }, data: { trackStatus: "failed" } });
          await redis.xack(STREAM, GROUP, msgId);
          continue;
        }

        await prisma.track.update({ where: { id: trackId }, data: { trackStatus: "analyzing" } });

        const workerResult = await runWorker(track.audioFilePath);

        if (workerResult.success) {
          const data = workerResult.data as {
            timeline: number[][];
            tempo?: number;
            tonalCharacter?: string;
            energyCharacter?: string;
          };
          await prisma.track.update({
            where: { id: trackId },
            data: {
              trackStatus: "analyzed",
              timeline: data.timeline as never,
              tempo: data.tempo ?? null,
              tonalCharacter: data.tonalCharacter ?? null,
              energyCharacter: data.energyCharacter ?? null,
            },
          });
        } else {
          console.error(`Consumer: worker failed for ${trackId}: ${workerResult.error}`);
          await prisma.track.update({ where: { id: trackId }, data: { trackStatus: "failed" } });
        }

        // Always ack regardless of outcome
        await redis.xack(STREAM, GROUP, msgId);
      }
    }
  } finally {
    redis.disconnect();
  }
}
