// Musixmatch lyrics linkage.
// Given an ISRC or artist+title, returns lyrics availability, language, and explicit flag.
// Used to surface lyric license status in the rights pipeline.

const MM_BASE = "https://api.musixmatch.com/ws/1.1";
const MM_KEY = process.env.MUSIXMATCH_API_KEY ?? "";

export interface MusixmatchEnrichment {
  trackId: number | null;
  hasLyrics: boolean;
  explicit: boolean;
  language: string | null;
  url: string | null;
  isrc: string | null;
}

interface MMTrack {
  track_id: number;
  track_name: string;
  artist_name: string;
  has_lyrics: number;
  explicit: number;
  track_share_url: string;
  track_isrc?: string;
  primary_genres?: { music_genre_list: Array<{ music_genre: { music_genre_name: string } }> };
}

interface MMResponse {
  message: {
    header: { status_code: number };
    body: { track?: MMTrack; track_list?: Array<{ track: MMTrack }> };
  };
}

async function mmFetch(path: string): Promise<MMResponse> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${MM_BASE}${path}${sep}apikey=${MM_KEY}`);
  if (!res.ok) throw new Error(`Musixmatch HTTP ${res.status}`);
  return await res.json() as MMResponse;
}

function mapTrack(track: MMTrack): MusixmatchEnrichment {
  return {
    trackId:  track.track_id,
    hasLyrics: track.has_lyrics === 1,
    explicit:  track.explicit  === 1,
    language:  null, // language requires a separate lyrics.get call — skip for now
    url:       track.track_share_url ?? null,
    isrc:      track.track_isrc ?? null,
  };
}

export async function enrichFromMusixmatch(params: {
  isrc?: string | null;
  artist?: string | null;
  title?: string | null;
}): Promise<MusixmatchEnrichment | null> {
  if (!MM_KEY) return null;

  // Try ISRC first — most precise
  if (params.isrc) {
    try {
      const data = await mmFetch(`/track.get?track_isrc=${encodeURIComponent(params.isrc)}`);
      if (data.message.header.status_code === 200 && data.message.body.track) {
        return mapTrack(data.message.body.track);
      }
    } catch { /* fall through to search */ }
  }

  // Fallback: artist + title search
  if (params.artist && params.title) {
    try {
      const q = `q_artist=${encodeURIComponent(params.artist)}&q_track=${encodeURIComponent(params.title)}&page_size=1&s_track_rating=desc`;
      const data = await mmFetch(`/track.search?${q}`);
      if (data.message.header.status_code === 200) {
        const first = data.message.body.track_list?.[0]?.track;
        if (first) return mapTrack(first);
      }
    } catch { /* non-fatal */ }
  }

  return null;
}
