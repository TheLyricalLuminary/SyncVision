/**
 * lrclib.ts — LRCLib lyrics fetcher with three-state result model.
 *
 * API: GET https://lrclib.net/api/search?track_name={title}&artist_name={artist}
 * No API key required. Uses plainLyrics (not syncedLyrics).
 *
 * Three states:
 *   FULL         — plainLyrics present with real text lines
 *   INSTRUMENTAL — track is confirmed instrumental (LRCLib flags it, or zero lyric lines)
 *   UNAVAILABLE  — LRCLib returned nothing for this track
 */

export type LyricsState = "FULL" | "INSTRUMENTAL" | "UNAVAILABLE";

export interface LyricsResult {
  state: LyricsState;
  text: string | null;   // normalized lyric text, null for non-FULL states
  label: string;         // human-readable status for UI/logging
  source: "lrclib";
}

interface LrclibEntry {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

const LRCLIB_BASE = "https://lrclib.net/api";

// Bare minimum non-empty lyric content — lines that appear in LRCLib responses
// for instrumental tracks ("...") don't count as lyric text.
function hasLyricContent(plain: string): boolean {
  const lines = plain
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0 && l !== "...");
  return lines.length >= 3;
}

export async function fetchLyrics(
  title: string,
  artist: string,
): Promise<LyricsResult> {
  const url =
    `${LRCLIB_BASE}/search` +
    `?track_name=${encodeURIComponent(title)}` +
    `&artist_name=${encodeURIComponent(artist)}`;

  let entries: LrclibEntry[];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "SyncVision/1.0 (sync licensing platform)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        state: "UNAVAILABLE",
        text: null,
        label: "Lyrics unavailable — semantic match not evaluated",
        source: "lrclib",
      };
    }
    entries = (await res.json()) as LrclibEntry[];
  } catch {
    return {
      state: "UNAVAILABLE",
      text: null,
      label: "Lyrics unavailable — semantic match not evaluated",
      source: "lrclib",
    };
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      state: "UNAVAILABLE",
      text: null,
      label: "Lyrics unavailable — semantic match not evaluated",
      source: "lrclib",
    };
  }

  // Pick the best match: prefer exact title+artist match, then first result.
  const titleLower  = title.trim().toLowerCase();
  const artistLower = artist.trim().toLowerCase();
  const exact = entries.find(
    e =>
      e.trackName.toLowerCase() === titleLower &&
      e.artistName.toLowerCase() === artistLower,
  ) ?? entries[0];

  // LRCLib instrumental flag
  if (exact.instrumental) {
    return {
      state: "INSTRUMENTAL",
      text: null,
      label: "Instrumental — no lyric content to evaluate",
      source: "lrclib",
    };
  }

  const plain = exact.plainLyrics ?? "";

  // Treat as instrumental if plainLyrics is empty or contains only placeholder dots
  if (!hasLyricContent(plain)) {
    return {
      state: "INSTRUMENTAL",
      text: null,
      label: "Instrumental — no lyric content to evaluate",
      source: "lrclib",
    };
  }

  return {
    state: "FULL",
    text: plain,
    label: "Lyrics found",
    source: "lrclib",
  };
}
