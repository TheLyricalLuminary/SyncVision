/**
 * backfillLyrics.ts — backfill lyricsText/State/Source for all tracks where
 * lyricsState IS NULL and isArchived = false.
 *
 * Handles two cases:
 *   1. artistName is set — fetch with title + artist directly.
 *   2. artistName is null — try to parse "Artist - Title" from the title string;
 *      if not parseable, try a title-only LRCLib search (empty artist string).
 *
 * Logs: title | state | source | charCount — no lyric text.
 *
 * Run: npx tsx src/scripts/backfillLyrics.ts
 */

import "dotenv/config";
import prisma from "../lib/prisma";
import { fetchLyrics, cleanTitle, cleanArtist, type LyricsResult } from "../lib/lrclib";

const RATE_DELAY_MS = 400;

// Match "Artist - Title" or "Artist – Title" (em dash) with reasonable guards:
// artist part must be ≥ 2 chars, title part must be ≥ 1 char.
const ARTIST_TITLE_RE = /^(.{2,}?)\s+[-–]\s+(.+)$/;

function parseArtistTitle(raw: string): { artist: string; title: string } | null {
  const m = ARTIST_TITLE_RE.exec(raw.trim());
  if (!m) return null;
  return {
    artist: cleanArtist(m[1].trim()),
    title:  cleanTitle(m[2].trim()),
  };
}

async function fetchWithFallback(
  title: string,
  artist: string,
): Promise<LyricsResult> {
  return fetchLyrics(title, artist);
}

async function main() {
  const tracks = await prisma.track.findMany({
    where: { lyricsState: null, isArchived: false },
    select: { id: true, title: true, artistName: true },
    orderBy: { title: "asc" },
  });

  console.log(`Found ${tracks.length} tracks with lyricsState IS NULL`);

  let updated = 0;
  let unavailable = 0;
  let errored = 0;

  for (const track of tracks) {
    let fetchTitle: string;
    let fetchArtist: string;
    let parseMethod: string;

    if (track.artistName) {
      fetchTitle  = cleanTitle(track.title);
      fetchArtist = cleanArtist(track.artistName);
      parseMethod = "direct";
    } else {
      // Try to parse "Artist - Title" from the title string
      const parsed = parseArtistTitle(track.title);
      if (parsed) {
        fetchTitle  = parsed.title;
        fetchArtist = parsed.artist;
        parseMethod = "parsed";
      } else {
        // Title only — let LRCLib find a best match
        fetchTitle  = cleanTitle(track.title);
        fetchArtist = "";
        parseMethod = "title-only";
      }
    }

    const result = await fetchWithFallback(fetchTitle, fetchArtist).catch(err => {
      console.warn(`  ERROR | ${track.title} | ${err instanceof Error ? err.message : err}`);
      errored++;
      return null;
    });

    if (!result) continue;

    await prisma.track.update({
      where: { id: track.id },
      data: {
        lyricsText:   result.text,
        lyricsState:  result.state,
        lyricsSource: result.source,
      },
    }).catch(err => {
      console.warn(`  DB-ERR | ${track.title} | ${err instanceof Error ? err.message : err}`);
    });

    const charCount = result.text?.length ?? 0;
    const label = result.state === "UNAVAILABLE" ? "UNAVAILABLE " : result.state.padEnd(11);
    console.log(`  ${label} | [${parseMethod}] ${track.title.padEnd(45)} | src=${result.source ?? 'n/a'} | chars=${charCount}`);

    if (result.state === "UNAVAILABLE") unavailable++;
    else updated++;

    await new Promise(r => setTimeout(r, RATE_DELAY_MS));
  }

  console.log(`\nDone. updated=${updated}  unavailable=${unavailable}  errors=${errored}  total=${tracks.length}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
