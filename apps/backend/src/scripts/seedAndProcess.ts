// Seed the 5 new SyncVision tracks and run them through the live queue.
//
// Idempotent: if a track with a given ISRC already exists, we skip the
// create step and just refresh its audioFilePath, then enqueue it.
//
// The consumer is started in-process with an AbortSignal; once all 5 tracks
// have reached a terminal state ("analyzed" or "failed"), we abort.

import "dotenv/config";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import { enqueueTrack } from "../queue/producer";
import { startConsumer } from "../queue/consumer";

const AUDIO_DIR = path.resolve(__dirname, "../../audio");

type SeedTrack = {
  title: string;
  isrc: string;
  ascapWorkId: string;
  audioFile: string;
  workIdNote?: string;
};

const NEW_TRACKS: SeedTrack[] = [
  { title: "Endless Sky",       isrc: "QZTAW2534564", ascapWorkId: "930472120",                                        audioFile: "EndlessSky.wav" },
  { title: "Caliente",          isrc: "QZTAW2534557", ascapWorkId: "930447150" /* VERIFY: ASCAP Work ID */,            audioFile: "Caliente.wav" },
  { title: "Night Type Thing",  isrc: "QZTAW2534568", ascapWorkId: "930472318",                                        audioFile: "NightTypeThing.mp3" },
  { title: "New Waves",         isrc: "QZNWZ2589581", ascapWorkId: "930472313",                                        audioFile: "NewWaves.wav" },
  { title: "Dreams Hit Harder", isrc: "QZTAW2534560", ascapWorkId: "930471524",                                        audioFile: "DreamsHitHarder.wav" },
];

const ARTIST = "Mark William Amigoni";

async function upsertTrack(t: SeedTrack): Promise<string> {
  const audioFilePath = path.join(AUDIO_DIR, t.audioFile);
  if (!fs.existsSync(audioFilePath)) {
    throw new Error(`Audio file not found: ${audioFilePath}`);
  }

  const existing = await prisma.track.findFirst({ where: { isrc: t.isrc } });

  if (existing) {
    await prisma.track.update({
      where: { id: existing.id },
      data: {
        title: t.title,
        artistName: ARTIST,
        audioFilePath,
        // Reset to uploaded so the consumer doesn't immediately skip via idempotency
        trackStatus: "uploaded",
      },
    });
    // Ensure rights profile is up to date
    await prisma.rightsProfile.upsert({
      where: { trackId: existing.id },
      create: {
        trackId: existing.id,
        ascapWorkId: t.ascapWorkId,
        masterOwnershipPct: 100,
        isOneStop: true,
        writerName: ARTIST,
        writerIpi: "1272656440",
        publisherName: "The Lyrical Luminary",
        proAffiliation: "ASCAP",
      },
      update: {
        ascapWorkId: t.ascapWorkId,
        masterOwnershipPct: 100,
        isOneStop: true,
        writerName: ARTIST,
        writerIpi: "1272656440",
        publisherName: "The Lyrical Luminary",
        proAffiliation: "ASCAP",
      },
    });
    return existing.id;
  }

  const created = await prisma.track.create({
    data: {
      title: t.title,
      isrc: t.isrc,
      artistName: ARTIST,
      audioFilePath,
      rightsProfile: {
        create: {
          ascapWorkId: t.ascapWorkId,
          masterOwnershipPct: 100,
          isOneStop: true,
          writerName: ARTIST,
          writerIpi: "1272656440",
          publisherName: "The Lyrical Luminary",
          proAffiliation: "ASCAP",
        },
      },
    },
  });
  return created.id;
}

async function main() {
  console.log("\n=== Seed + live-queue ingestion of 5 tracks ===\n");

  // Start the consumer first so the consumer group exists before any XADD.
  const controller = new AbortController();
  const consumerDone = startConsumer(controller.signal);

  // Give the consumer a moment to create the group.
  await new Promise((r) => setTimeout(r, 1_000));

  const ids: string[] = [];
  for (const t of NEW_TRACKS) {
    const id = await upsertTrack(t);
    ids.push(id);
    console.log(`  Upserted: ${t.title.padEnd(20)} (${t.isrc})  →  ${id}`);
  }

  for (const id of ids) {
    await enqueueTrack(id);
  }
  console.log(`\n  Enqueued ${ids.length} tracks → stream syncvision:analysis`);

  // Poll for terminal states (10 minute ceiling; each librosa run can take 20-60s)
  const deadline = Date.now() + 10 * 60 * 1000;
  let lastReport = "";
  while (Date.now() < deadline) {
    const rows = await prisma.track.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, trackStatus: true },
    });
    const status = rows
      .map((r) => `${r.title}=${r.trackStatus}`)
      .sort()
      .join(", ");
    if (status !== lastReport) {
      console.log(`  [${new Date().toISOString().slice(11, 19)}] ${status}`);
      lastReport = status;
    }
    const allTerminal = rows.every(
      (r) => r.trackStatus === "analyzed" || r.trackStatus === "failed"
    );
    if (allTerminal) break;
    await new Promise((r) => setTimeout(r, 2_000));
  }

  // Stop the consumer (will finish its current BLOCK 5000 then exit cleanly).
  controller.abort();
  await consumerDone;

  // Final report
  const final = await prisma.track.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, title: true, isrc: true, trackStatus: true,
      tempo: true, tonalCharacter: true, energyCharacter: true,
      audioFilePath: true, timeline: true,
    },
  });

  console.log("\n=== Final state ===\n");
  for (const t of final) {
    const hasTimeline = Array.isArray(t.timeline) && (t.timeline as unknown[]).length > 0;
    console.log(
      `  ${t.title.padEnd(20)} status=${t.trackStatus.padEnd(10)} ` +
      `tempo=${t.tempo ?? "null"}  tonal=${t.tonalCharacter ?? "null"}  ` +
      `energy=${t.energyCharacter ?? "null"}  timeline=${hasTimeline ? "ok" : "MISSING"}`
    );
  }

  const failed = final.filter((t) => t.trackStatus !== "analyzed");
  if (failed.length > 0) {
    console.error(`\n${failed.length} track(s) did not reach 'analyzed'`);
    process.exit(1);
  }
  console.log("\nAll 5 tracks analyzed successfully.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
