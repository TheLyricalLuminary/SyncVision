/**
 * sanityCheckGriefLoss.ts
 *
 * Post-wiring sanity check: confirms that buildLyricsAxis is live and that
 * the Grief/Loss FitIndex spread is wider than the pre-fix stub (where every
 * track returned axis=0.50 → identical FitIndex contribution for all tracks).
 *
 * Method: fetch lyrics for 6 test tracks, run through the now-real
 * buildLyricsAxis, then compute FitIndex using neutral 0.50 for scene /
 * rights / audioSignal. Isolating the lyrics axis shows the spread clearly.
 *
 *   FitIndex = scene*0.40 + rights*0.25 + lyrics*0.20 + signal*0.15
 *   With all other axes neutral (0.50):
 *     old stub : FitIndex = 0.50 for every track  (zero spread)
 *     new real : FitIndex = 0.40 + lyricsAxis*0.20  (varies per track)
 *
 * Output contract: NO raw lyric text in the JSON or console output.
 * Writes safe fields to /tmp/grief_sanity.json.
 *
 * Run: npx tsx src/scripts/sanityCheckGriefLoss.ts
 */

import "dotenv/config";
import { writeFileSync } from "fs";
import { fetchLyrics } from "../lib/lrclib";
import { buildLyricsAxis, WEIGHTS } from "../scoring/trackVector";

const BRIEF_ID = "grief-loss";
const OUT_PATH = "/tmp/grief_sanity.json";

// Other-axis baseline — neutral 0.50 to isolate the lyrics signal.
const NEUTRAL = 0.50;

const TEST_TRACKS = [
  { title: "Hurt",              artist: "Johnny Cash"       },
  { title: "Holocene",          artist: "Bon Iver"          },
  { title: "Seven Nation Army", artist: "The White Stripes" },
  { title: "Billie Jean",       artist: "Michael Jackson"   },
  { title: "Iris",              artist: "Goo Goo Dolls"     },
  { title: "Intro",             artist: "The xx"            },
];

interface SanityEntry {
  rank:           number;
  track:          string;
  lyricsState:    string;
  lyricsAxis:     number;   // 0.00–1.00; neutral states = 0.50
  fitIndex_old:   number;   // stub: all 0.50 → FitIndex was identical
  fitIndex_new:   number;   // real lyrics axis wired in
  fitIndexDelta:  number;   // new − old (positive = above neutral, negative = below)
}

function computeFitIndex(lyricsAxis: number): number {
  return parseFloat((
    NEUTRAL    * WEIGHTS.scene       +
    NEUTRAL    * WEIGHTS.rights      +
    lyricsAxis * WEIGHTS.lyrics      +
    NEUTRAL    * WEIGHTS.audioSignal
  ).toFixed(4));
}

const STUB_AXIS      = 0.50;
const STUB_FIT_INDEX = computeFitIndex(STUB_AXIS);

async function main() {
  const entries: SanityEntry[] = [];

  for (const { title, artist } of TEST_TRACKS) {
    const lyrics = await fetchLyrics(title, artist);

    // buildLyricsAxis is now the real implementation — not the stub.
    const lyricsAxis = buildLyricsAxis({
      lyricsText:  lyrics.text,
      lyricsState: lyrics.state,
      briefId:     BRIEF_ID,
    });

    const fitIndex_new = computeFitIndex(lyricsAxis);

    entries.push({
      rank:          0,                // filled after sort
      track:         title,
      lyricsState:   lyrics.state,
      lyricsAxis:    parseFloat(lyricsAxis.toFixed(4)),
      fitIndex_old:  STUB_FIT_INDEX,
      fitIndex_new,
      fitIndexDelta: parseFloat((fitIndex_new - STUB_FIT_INDEX).toFixed(4)),
    });

    await new Promise(r => setTimeout(r, 300));
  }

  // Rank by new FitIndex descending; break ties alphabetically.
  entries.sort((a, b) =>
    b.fitIndex_new !== a.fitIndex_new
      ? b.fitIndex_new - a.fitIndex_new
      : a.track.localeCompare(b.track),
  );
  entries.forEach((e, i) => { e.rank = i + 1; });

  // Spread stats
  const fitValues    = entries.map(e => e.fitIndex_new);
  const spread_new   = parseFloat((Math.max(...fitValues) - Math.min(...fitValues)).toFixed(4));
  const spread_old   = 0;  // stub: all identical

  const output = { brief: BRIEF_ID, spread_old, spread_new, tracks: entries };
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  console.log(`Wrote sanity results to ${OUT_PATH} (no lyric text). spread_old=${spread_old} spread_new=${spread_new}`);
}

main().catch(e => { console.error(e); process.exit(1); });
