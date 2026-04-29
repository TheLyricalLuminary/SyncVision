import "dotenv/config";
import prisma from "../lib/prisma";

async function main() {
  const tracks = await prisma.track.findMany({
    select: {
      id: true, title: true, isrc: true, trackStatus: true,
      tempo: true, tonalCharacter: true, energyCharacter: true,
      audioFilePath: true, timeline: true,
    },
    orderBy: { title: "asc" },
  });

  console.log(`\nFound ${tracks.length} tracks in DB.\n`);

  let bad = 0;
  for (const t of tracks) {
    const issues: string[] = [];
    if (t.tempo == null) issues.push("tempo");
    if (!t.tonalCharacter) issues.push("tonalCharacter");
    if (!t.energyCharacter) issues.push("energyCharacter");
    if (!t.audioFilePath) issues.push("audioFilePath");
    if (!Array.isArray(t.timeline) || (t.timeline as unknown[]).length === 0) issues.push("timeline");
    if (t.trackStatus !== "analyzed") issues.push(`status=${t.trackStatus}`);
    if (t.audioFilePath?.includes("/tmp/placeholder.wav") || t.audioFilePath?.includes("/Downloads/")) {
      issues.push(`unstable path: ${t.audioFilePath}`);
    }
    const ok = issues.length === 0 ? "OK " : "FAIL";
    if (issues.length > 0) bad++;
    console.log(
      `  [${ok}] ${t.title.padEnd(22)} ${t.isrc.padEnd(13)} ` +
      `tempo=${String(t.tempo ?? "null").padEnd(6)} tonal=${(t.tonalCharacter ?? "null").padEnd(9)} ` +
      `energy=${(t.energyCharacter ?? "null").padEnd(11)} ${issues.length ? "→ " + issues.join(", ") : ""}`
    );
  }

  await prisma.$disconnect();
  if (bad > 0) {
    console.error(`\n${bad}/${tracks.length} tracks have missing/invalid DSP fields.\n`);
    process.exit(1);
  }
  console.log(`\nAll ${tracks.length} tracks have complete DSP data.\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
