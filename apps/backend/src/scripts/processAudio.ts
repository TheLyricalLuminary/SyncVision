import { execSync } from "child_process";
import { join } from "path";
import prisma from "../lib/prisma";

const WORKER_SCRIPT = join(__dirname, "../../../worker/analyze.py");

// ISRC → absolute path of the audio file
const AUDIO_FILES: Record<string, string> = {
  QZRP52418558: "/Users/bucka/Downloads/LANDRNeverLettingGoWarmLow.wav",
  QZTB72567824: "/Users/bucka/Downloads/Songbay24bitWhereWeBelongReferanceoQHb.wav",
  QZTB72565415: "/Users/bucka/Downloads/Songbay24bitBreakingChainsReverbnationiLwp.wav",
};

interface AnalysisResult {
  timeline: number[][];
  dimensions: string[];
  durationSeconds: number;
  tempo: number;
  tonalCharacter: string;
  energyCharacter: string;
  inputHash: string;
}

async function main() {
  const tracks = await prisma.track.findMany();

  for (const track of tracks) {
    const filePath = AUDIO_FILES[track.isrc];
    if (!filePath) {
      console.warn(`No audio file mapped for ISRC ${track.isrc} — skipping.`);
      continue;
    }

    console.log(`Analyzing: ${track.title} (${track.isrc})`);
    const raw = execSync(
      `/opt/homebrew/opt/python@3.11/bin/python3.11 "${WORKER_SCRIPT}" "${filePath}"`,
      { maxBuffer: 64 * 1024 * 1024 }
    ).toString();

    const result: AnalysisResult = JSON.parse(raw);

    await prisma.track.update({
      where: { id: track.id },
      data: {
        audioFilePath: filePath,
        timeline: result.timeline,
        tempo: result.tempo,
        tonalCharacter: result.tonalCharacter,
        energyCharacter: result.energyCharacter,
        trackStatus: "analyzed",
      },
    });

    console.log(
      `  tonalCharacter: ${result.tonalCharacter}  energyCharacter: ${result.energyCharacter}  tempo: ${result.tempo} BPM`
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
