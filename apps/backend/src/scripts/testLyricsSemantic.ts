/**
 * testLyricsSemantic.ts — review gate for the lyricsSemantic axis.
 *
 * Output contract: NEVER prints or writes raw lyric text anywhere.
 * Writes results to /tmp/lyrics_results.json as an array of:
 *   { track, lyricsState, charCount, chaseScore, matchedTerms }
 * where matchedTerms is the list of OUR lexicon keywords that matched
 * (not lyric text). Lyrics live only in the DB and in memory.
 *
 * Run: npx tsx src/scripts/testLyricsSemantic.ts
 *
 * REVIEW GATE: this script exists solely for human approval.
 * Do NOT import lyricsSemantic.ts from trackVector.ts until approved.
 */

import "dotenv/config";
import { writeFileSync } from "fs";
import prisma from "../lib/prisma";
import { fetchLyrics } from "../lib/lrclib";
import { scoreLyricsSemantic } from "../scoring/lyricsSemantic";

const BRIEF_ID = "chase-tension";
const OUT_PATH = "/tmp/lyrics_results.json";

const TEST_TRACKS = [
  { title: "Seven Nation Army", artist: "The White Stripes" },
  { title: "Iris",              artist: "Goo Goo Dolls" },
  { title: "Billie Jean",       artist: "Michael Jackson" },
  { title: "Holocene",          artist: "Bon Iver" },
  { title: "Intro",             artist: "The xx" },
];

interface ResultEntry {
  track: string;
  lyricsState: string;
  charCount: number | null;   // length of fetched text; null when no text
  chaseScore: number;         // 0–100; 50 = neutral for non-FULL states
  neutral: boolean;           // true when score is the neutral 50 (not a real match)
  matchedTerms: string[];     // OUR lexicon keywords only — never lyric text
}

async function main() {
  const results: ResultEntry[] = [];

  for (const { title, artist } of TEST_TRACKS) {
    const lyrics = await fetchLyrics(title, artist);

    // Persist lyrics to DB if a matching track record exists (best-effort).
    // This is the only place lyric text travels — straight into the DB column.
    try {
      const row = await prisma.track.findFirst({ where: { title } });
      if (row) {
        await prisma.track.update({
          where: { id: row.id },
          data: { lyricsText: lyrics.text, lyricsState: lyrics.state },
        });
      }
    } catch {
      // DB write failure doesn't block the review output
    }

    const result = scoreLyricsSemantic(lyrics.text, lyrics.state, BRIEF_ID);

    results.push({
      track: title,
      lyricsState: result.state,
      charCount: lyrics.text !== null ? lyrics.text.length : null,
      chaseScore: result.score,
      neutral: result.state !== "FULL",
      // .term is the lexicon keyword (e.g. "run", "drive"), not lyric content.
      matchedTerms: result.matchedTerms.map(m => m.term),
    });

    await new Promise(r => setTimeout(r, 300));
  }

  // Write the JSON file. No lyric text is included in this structure.
  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2), "utf-8");

  // Console output is deliberately minimal — a confirmation only.
  console.log(`Wrote ${results.length} results to ${OUT_PATH} (no lyric text included).`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
