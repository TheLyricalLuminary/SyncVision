/**
 * One-time backfill: mark existing analyzed tracks as non-synthetic.
 *
 * Rows written before the isSynthetic/processedAt/confidence columns existed
 * default to isSynthetic=true, processedAt=null, confidence=null — which the
 * scoring gate correctly blocks. This script retrofits the correct values for
 * every track that has trackStatus="analyzed" and a valid 512-point timeline,
 * i.e. rows we know were produced by the real librosa pipeline.
 *
 * Confidence is recomputed from the stored timeline using the same formula as
 * analyze.py: mean std across 5 dims, normalised by 0.12, capped at 1.0.
 *
 * Run once after the schema migration:
 *   npx tsx src/scripts/backfillAuthenticityFlags.ts
 */

import "dotenv/config";
import prisma from "../lib/prisma";

function std(values: number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeConfidence(timeline: number[][]): number {
  if (timeline.length !== 512 || timeline[0].length < 5) return 0;
  const dims = [0, 1, 2, 3, 4].map((d) => timeline.map((row) => row[d]));
  const meanStd = dims.reduce((s, dim) => s + std(dim), 0) / dims.length;
  return Math.min(1.0, Math.round((meanStd / 0.12) * 10000) / 10000);
}

async function main() {
  const candidates = await prisma.track.findMany({
    where: { trackStatus: "analyzed" },
    select: { id: true, isrc: true, timeline: true, processedAt: true },
  });

  console.log(`Found ${candidates.length} analyzed track(s) to inspect.`);

  let updated = 0;
  let skipped = 0;

  for (const track of candidates) {
    const timeline = track.timeline as number[][] | null;

    if (!Array.isArray(timeline) || timeline.length !== 512) {
      console.warn(`  SKIP ${track.isrc} — timeline missing or not 512 points`);
      skipped++;
      continue;
    }

    const confidence = computeConfidence(timeline);

    await prisma.track.update({
      where: { id: track.id },
      data: {
        isSynthetic: false,
        processedAt: track.processedAt ?? new Date(),
        confidence,
      },
    });

    console.log(`  OK   ${track.isrc}  confidence=${confidence.toFixed(4)}`);
    updated++;
  }

  console.log(`\nDone. updated=${updated}  skipped=${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
