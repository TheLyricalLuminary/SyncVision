import "dotenv/config";
import fs from "fs";
import os from "os";
import path from "path";
import Redis from "ioredis";
import prisma from "../lib/prisma";
import { enqueueTrack } from "./producer";
import { startConsumer } from "./consumer";

const STREAM = "syncvision:analysis";
const GROUP = "workers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestWav(filePath: string): void {
  const sampleRate = 22050;
  const numSamples = sampleRate; // 1 second
  const dataSize = numSamples * 2; // 16-bit mono
  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;

  buf.write("RIFF", o); o += 4;
  buf.writeUInt32LE(36 + dataSize, o); o += 4;
  buf.write("WAVE", o); o += 4;
  buf.write("fmt ", o); o += 4;
  buf.writeUInt32LE(16, o); o += 4;   // PCM chunk size
  buf.writeUInt16LE(1, o); o += 2;    // PCM format
  buf.writeUInt16LE(1, o); o += 2;    // mono
  buf.writeUInt32LE(sampleRate, o); o += 4;
  buf.writeUInt32LE(sampleRate * 2, o); o += 4; // byte rate
  buf.writeUInt16LE(2, o); o += 2;    // block align
  buf.writeUInt16LE(16, o); o += 2;   // bits per sample
  buf.write("data", o); o += 4;
  buf.writeUInt32LE(dataSize, o); o += 4;

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(32767 * Math.sin((2 * Math.PI * 440 * i) / sampleRate));
    buf.writeInt16LE(sample, o); o += 2;
  }

  fs.writeFileSync(filePath, buf);
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

async function runTest(): Promise<void> {
  console.log("\n=== Queue integration test ===\n");

  const redis = new Redis(process.env.REDIS_URL!);

  // Clean up any leftover stream from a previous run
  await redis.del(STREAM);

  // Find one of the three seeded tracks
  const track = await prisma.track.findFirst();
  assert(track !== null, "No seeded tracks found — run the seed script first");

  // Write a real WAV file so the worker can process it
  const wavPath = path.join(os.tmpdir(), `syncvision-test-${track!.id}.wav`);
  makeTestWav(wavPath);
  console.log(`  WAV written: ${wavPath}`);

  // Attach the audio file path to the track
  await prisma.track.update({
    where: { id: track!.id },
    data: { audioFilePath: wavPath, trackStatus: "uploaded" },
  });

  // Start consumer before enqueuing so the group exists when the message arrives
  const controller = new AbortController();
  const consumerDone = startConsumer(controller.signal);

  // Give the consumer time to create the consumer group
  await new Promise((r) => setTimeout(r, 1_000));

  // Enqueue
  await enqueueTrack(track!.id);
  const afterEnqueue = await prisma.track.findUnique({ where: { id: track!.id } });
  assert(afterEnqueue!.trackStatus === "queued", `Expected 'queued', got '${afterEnqueue!.trackStatus}'`);
  console.log("  PASS [trackStatus = queued after enqueue]");

  // Poll for the track to reach a terminal state (max 30 s)
  const deadline = Date.now() + 30_000;
  let finalStatus = "";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    const t = await prisma.track.findUnique({ where: { id: track!.id } });
    finalStatus = t!.trackStatus;
    if (finalStatus === "analyzed" || finalStatus === "failed") break;
  }

  // Stop the consumer
  controller.abort();
  await consumerDone;

  assert(finalStatus === "analyzed", `Expected trackStatus 'analyzed', got '${finalStatus}'`);
  console.log("  PASS [trackStatus = analyzed]");

  // Verify the timeline was stored
  const analyzed = await prisma.track.findUnique({ where: { id: track!.id } });
  assert(analyzed!.timeline !== null, "Expected timeline to be stored in track record");
  console.log("  PASS [timeline stored in track record]");

  // Verify no pending messages remain
  const pending = await redis.xpending(STREAM, GROUP, "-", "+", "10") as unknown[];
  assert(pending.length === 0, `Expected 0 pending messages, got ${pending.length}`);
  console.log("  PASS [pending message count = 0]");

  // Cleanup
  fs.unlinkSync(wavPath);
  redis.disconnect();
  await prisma.$disconnect();

  console.log("\nAll queue integration tests passed.\n");
  process.exit(0);
}

runTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
