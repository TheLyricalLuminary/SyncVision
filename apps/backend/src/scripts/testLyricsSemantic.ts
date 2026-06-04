/**
 * testLyricsSemantic.ts — review gate for the lyricsSemantic axis.
 *
 * Output contract: NEVER prints or writes raw lyric text anywhere.
 * Writes to /tmp/lyrics_results.json:
 *   { track, lyricsState, charCount, lyricsScore, axisValue, matchedTerms }
 * matchedTerms = our own lexicon keywords (never lyric text).
 * Lyrics live only in the DB and in process memory — they do not appear
 * in the JSON file or anywhere in this script's output.
 *
 * Run: npx tsx src/scripts/testLyricsSemantic.ts
 *
 * REVIEW GATE — do NOT import lyricsSemantic into trackVector.ts until approved.
 */

import "dotenv/config";
import { writeFileSync } from "fs";
import prisma from "../lib/prisma";
import { fetchLyrics } from "../lib/lrclib";
import { scoreLyricsSemantic } from "../scoring/lyricsSemantic";

const BRIEF_ID  = "grief-loss";
const OUT_PATH  = "/tmp/lyrics_results.json";

const TEST_TRACKS = [
  { title: "Hurt",              artist: "Johnny Cash"       },
  { title: "Holocene",          artist: "Bon Iver"          },
  { title: "Seven Nation Army", artist: "The White Stripes" },
  { title: "Billie Jean",       artist: "Michael Jackson"   },
  { title: "Iris",              artist: "Goo Goo Dolls"     },
  { title: "Intro",             artist: "The xx"            },
];

interface ResultEntry {
  track:        string;
  artist:       string;
  lyricsState:  string;
  charCount:    number | null;  // length of fetched text; null when no lyrics
  lyricsScore:  number;         // 0–100 vocabulary-overlap score
  axisValue:    number;         // lyricsScore / 100; neutral states = 0.50
  neutral:      boolean;        // true when state is INSTRUMENTAL or UNAVAILABLE
  matchedTerms: string[];       // our lexicon keywords only — never lyric text
  rawScore:     number;         // unscaled sum for calibration visibility
}

async function main() {
  const results: ResultEntry[] = [];

  for (const { title, artist } of TEST_TRACKS) {
    const lyrics = await fetchLyrics(title, artist);

    // Persist to DB if a matching track exists (best-effort; never logs text).
    try {
      const row = await prisma.track.findFirst({ where: { title } });
      if (row) {
        await prisma.track.update({
          where: { id: row.id },
          data:  { lyricsText: lyrics.text, lyricsState: lyrics.state },
        });
      }
    } catch {
      // DB write failure doesn't block the review output
    }

    const result = scoreLyricsSemantic(lyrics.text, lyrics.state, BRIEF_ID);

    // rawScore is visible in matchedTerms — sum it here for the JSON output.
    const rawScore = result.matchedTerms.reduce((s, m) => s + m.contribution, 0);

    results.push({
      track:        title,
      artist,
      lyricsState:  result.state,
      charCount:    lyrics.text !== null ? lyrics.text.length : null,
      lyricsScore:  result.score,
      axisValue:    result.axisValue,
      neutral:      result.state !== "FULL",
      // .term is our lexicon keyword (e.g. "gone", "hurt") — not lyric content.
      matchedTerms: result.matchedTerms.map(m => m.term),
      rawScore:     parseFloat(rawScore.toFixed(3)),
    });

    // Polite pause between API calls
    await new Promise(r => setTimeout(r, 300));
  }

  // Entire file contains no lyric text — safe to write and read back.
  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2), "utf-8");

  // One-line confirmation only — no per-track data streamed.
  console.log(`Wrote ${results.length} results to ${OUT_PATH} (no lyric text included).`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
