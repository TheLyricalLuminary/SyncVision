import "dotenv/config";
import prisma from "../lib/prisma";
import { calculateConfidenceScore } from "../scoring/confidenceScore";

const tracks = [
  {
    isrc: "QZTB72567824",
    ascapWorkId: "930167043",
    publisherName: "The Lyrical Luminary",
    proAffiliation: "ASCAP",
    label: "Mark Amigoni Productions",
    upc: "199518574193",
    isOneStop: true,
  },
  {
    isrc: "QZRP52418558",
    ascapWorkId: "928218454",
    publisherName: "The Lyrical Luminary",
    proAffiliation: "ASCAP",
    label: "Mark Amigoni Productions",
    upc: "198669820067",
    isOneStop: true,
  },
];

async function main() {
  for (const t of tracks) {
    const track = await prisma.track.findUnique({ where: { isrc: t.isrc } });
    if (!track) {
      console.error(`Track not found for ISRC ${t.isrc}`);
      continue;
    }

    // Upsert RightsProfile
    const rp = await prisma.rightsProfile.upsert({
      where: { trackId: track.id },
      create: {
        trackId: track.id,
        ascapWorkId: t.ascapWorkId,
        publisherName: t.publisherName,
        proAffiliation: t.proAffiliation,
        label: t.label,
        upc: t.upc,
        isOneStop: t.isOneStop,
      },
      update: {
        ascapWorkId: t.ascapWorkId,
        publisherName: t.publisherName,
        proAffiliation: t.proAffiliation,
        label: t.label,
        upc: t.upc,
        isOneStop: t.isOneStop,
      },
    });

    // Delete stale ConfidenceScore
    await prisma.confidenceScore.deleteMany({ where: { trackId: track.id } });

    // Recalculate
    const result = calculateConfidenceScore(
      { id: track.id, title: track.title, isrc: track.isrc },
      {
        id: rp.id,
        trackId: rp.trackId,
        ascapWorkId: rp.ascapWorkId,
        masterOwnershipPct: rp.masterOwnershipPct,
        isOneStop: rp.isOneStop,
        writerName: rp.writerName,
        writerIpi: rp.writerIpi,
        publisherName: rp.publisherName,
        proAffiliation: rp.proAffiliation,
      }
    );

    await prisma.confidenceScore.create({
      data: {
        trackId: track.id,
        score: result.score,
        confidenceLabel: result.breakdown.confidenceLabel,
        inputHash: result.inputHash,
        rightsBreakdown: result.breakdown.rightsAndProvenance,
        metaBreakdown: result.breakdown.metadataCompleteness,
        audioBreakdown: result.breakdown.audioQuality,
        sceneFitBreakdown: result.breakdown.sceneFit,
        explanation: result.breakdown.explanation,
      },
    });

    console.log(`\nISRC: ${t.isrc} (${track.title})`);
    console.log(`  Score: ${result.score}/100 [${result.breakdown.confidenceLabel}]`);
    console.log(`  Rights+Provenance: ${result.breakdown.rightsAndProvenance}/65`);
    console.log(`  Metadata:          ${result.breakdown.metadataCompleteness}/20`);
    console.log(`  Audio:             ${result.breakdown.audioQuality}/10`);
    console.log(`  Scene Fit:         ${result.breakdown.sceneFit}/5`);
    console.log(`  Explanation: ${result.breakdown.explanation}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
