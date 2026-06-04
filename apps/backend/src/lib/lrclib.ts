/**
 * lrclib.ts — LRCLib lyrics fetcher with Lyrics.ovh fallback.
 *
 * Fetch order:
 *   1. LRCLib  — GET https://lrclib.net/api/search?track_name=…&artist_name=…
 *   2. Lyrics.ovh — GET https://api.lyrics.ovh/v1/{artist}/{title}
 *   3. UNAVAILABLE if both fail
 *
 * Both APIs are free and require no API key.
 *
 * Three states:
 *   FULL         — plainLyrics present with real text lines
 *   INSTRUMENTAL — track is confirmed instrumental
 *   UNAVAILABLE  — neither source returned usable lyrics
 */

export type LyricsState = "FULL" | "INSTRUMENTAL" | "UNAVAILABLE";
export type LyricsSource = "lrclib" | "lyrics_ovh";

export interface LyricsResult {
  state: LyricsState;
  text: string | null;   // normalized lyric text, null for non-FULL states
  label: string;         // human-readable status for UI/logging
  source: LyricsSource | null;
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

const LRCLIB_BASE    = "https://lrclib.net/api";
const LYRICS_OVH_BASE = "https://api.lyrics.ovh/v1";

// ── String cleaning ───────────────────────────────────────────────────────────

const TITLE_SUFFIXES = [
  /\s*[\(\[]official video[\)\]]/gi,
  /\s*[\(\[]official audio[\)\]]/gi,
  /\s*[\(\[]remastered[^\)\]]*[\)\]]/gi,
  /\s*[\(\[]official music video[\)\]]/gi,
  /\s*[\(\[]lyric video[\)\]]/gi,
  /\s*[\(\[]audio[\)\]]/gi,
  /\s*[\(\[]hd[\)\]]/gi,
];

const ARTIST_SUFFIXES = [
  / - topic$/i,
  / - official(?: channel)?$/i,
  / - official video$/i,
  /\s*VEVO$/i,
];

export function cleanTitle(raw: string): string {
  let s = raw;
  for (const re of TITLE_SUFFIXES) s = s.replace(re, "");
  return s.trim();
}

export function cleanArtist(raw: string): string {
  let s = raw;
  for (const re of ARTIST_SUFFIXES) s = s.replace(re, "");
  return s.trim();
}

// ── LRCLib ────────────────────────────────────────────────────────────────────

// Bare minimum non-empty lyric content — lines that appear in LRCLib responses
// for instrumental tracks ("...") don't count as lyric text.
function hasLyricContent(plain: string): boolean {
  const lines = plain
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0 && l !== "...");
  return lines.length >= 3;
}

async function fetchFromLrclib(
  title: string,
  artist: string,
): Promise<LyricsResult | null> {
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
    if (!res.ok) return null;
    entries = (await res.json()) as LrclibEntry[];
  } catch {
    return null;
  }

  if (!Array.isArray(entries) || entries.length === 0) return null;

  const titleLower  = title.toLowerCase();
  const artistLower = artist.toLowerCase();
  const exact = entries.find(
    e =>
      e.trackName.toLowerCase() === titleLower &&
      e.artistName.toLowerCase() === artistLower,
  ) ?? entries[0];

  if (exact.instrumental) {
    return {
      state: "INSTRUMENTAL",
      text: null,
      label: "Instrumental — no lyric content to evaluate",
      source: "lrclib",
    };
  }

  const plain = exact.plainLyrics ?? "";
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

// ── Lyrics.ovh ────────────────────────────────────────────────────────────────

async function fetchFromLyricsOvh(
  title: string,
  artist: string,
): Promise<LyricsResult | null> {
  const url = `${LYRICS_OVH_BASE}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;

  let body: { lyrics?: string; error?: string };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "SyncVision/1.0 (sync licensing platform)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    body = (await res.json()) as { lyrics?: string; error?: string };
  } catch {
    return null;
  }

  if (body.error || !body.lyrics) return null;

  const plain = body.lyrics.trim();
  if (!hasLyricContent(plain)) return null;

  return {
    state: "FULL",
    text: plain,
    label: "Lyrics found",
    source: "lyrics_ovh",
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchLyrics(
  title: string,
  artist: string,
): Promise<LyricsResult> {
  const t = cleanTitle(title);
  const a = cleanArtist(artist);

  const lrclib = await fetchFromLrclib(t, a);
  if (lrclib) return lrclib;

  const ovh = await fetchFromLyricsOvh(t, a);
  if (ovh) return ovh;

  return {
    state: "UNAVAILABLE",
    text: null,
    label: "Lyrics unavailable — semantic match not evaluated",
    source: null,
  };
}
