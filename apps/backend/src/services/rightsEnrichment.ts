/**
 * Rights Enrichment Pipeline
 *
 * Fires parallel lookups against MusicBrainz, Discogs, iTunes, Last.fm,
 * TheAudioDB, Deezer, Genius, ASCAP, BMI, and SESAC.
 *
 * All source failures are soft — the pipeline never throws. Returns null
 * only when ALL sources fail. ASCAP/BMI/SESAC are HTTP-only scrapes with
 * cheerio; if the site is JS-rendered they return null silently.
 */

import prisma from "../lib/prisma";
import { evaluateRightsState, type TrackEvalInput } from "../scoring/rightsStateMachine";
import { enrichFromCreditsFm } from "../lib/creditsfm";
import * as cheerio from "cheerio";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnrichmentResult {
  isrc?: string | null;
  writerName?: string | null;
  writerIpi?: string | null;
  publisherName?: string | null;
  territory?: string | null;
  explicitFlag?: boolean | null;
  proAffiliation?: string | null;
  workId?: string | null;
  iswc?: string | null;
  genreTags?: string[];
  popularityScore?: number | null;
  enrichmentSources: string[];
}

interface MusicBrainzResult {
  isrc?: string | null;
  writerName?: string | null;
}

interface DiscogsResult {
  publisherName?: string | null;
  territory?: string | null;
}

interface ItunesResult {
  publisherName?: string | null;
  territory?: string | null;
  explicitFlag?: boolean | null;
}

interface LastfmResult {
  tags: string[];
  listeners?: string | null;
}

interface TheAudioDbResult {
  label?: string | null;
  genre?: string | null;
  mbId?: string | null;
}

interface DeezerResult {
  label?: string | null;
  explicitFlag?: boolean | null;
}

interface GeniusResult {
  artistName?: string | null;
}

interface ProResult {
  found: boolean;
  writer?: string | null;
  publisher?: string | null;
  workId?: string | null;
  proAffiliation?: string | null;
}

// ─── Timeout helper ───────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return Promise.race([
    promise.finally(() => clearTimeout(id)),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

// ─── Source: MusicBrainz ─────────────────────────────────────────────────────

async function fetchMusicBrainz(isrc: string): Promise<MusicBrainzResult> {
  const url = `https://musicbrainz.org/ws/2/recording/?query=isrc:${encodeURIComponent(isrc)}&fmt=json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "SyncVision/1.0 (amigonimark@gmail.com)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`MusicBrainz HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  const recordings = data["recordings"] as Array<Record<string, unknown>> | undefined;
  if (!recordings || recordings.length === 0) return {};

  const recording = recordings[0];
  const isrcList = recording["isrcs"] as string[] | undefined;
  const resolvedIsrc = isrcList?.[0] ?? null;

  const artistCredit = recording["artist-credit"] as Array<Record<string, unknown>> | undefined;
  const firstArtist = artistCredit?.[0]?.["artist"] as Record<string, unknown> | undefined;
  const writerName = (firstArtist?.["name"] as string | undefined) ?? null;

  return { isrc: resolvedIsrc, writerName };
}

// ─── Source: Discogs ─────────────────────────────────────────────────────────

async function fetchDiscogs(title: string, artist: string): Promise<DiscogsResult> {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) {
    throw new Error("DISCOGS_TOKEN not configured");
  }

  const params = new URLSearchParams({ q: title, artist, type: "release" });
  const url = `https://api.discogs.com/database/search?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Discogs token=${token}`,
      "User-Agent": "SyncVision/1.0",
    },
  });
  if (!res.ok) throw new Error(`Discogs HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  const results = data["results"] as Array<Record<string, unknown>> | undefined;
  if (!results || results.length === 0) return {};

  const first = results[0];
  const labels = first["label"] as string[] | undefined;
  const publisherName = labels?.[0] ?? null;
  const territory = (first["country"] as string | undefined) ?? null;

  return { publisherName, territory };
}

// ─── Source: iTunes ───────────────────────────────────────────────────────────

async function fetchItunes(title: string, artist: string): Promise<ItunesResult> {
  const term = encodeURIComponent(`${title} ${artist}`);
  const url = `https://itunes.apple.com/search?term=${term}&media=music&limit=5`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  const results = data["results"] as Array<Record<string, unknown>> | undefined;
  if (!results || results.length === 0) return {};

  const first = results[0];
  // collectionName is the album title, NOT the label — do not use for publisherName
  const explicitness = first["trackExplicitness"] as string | undefined;
  const explicitFlag = explicitness === "explicit" ? true : explicitness === "notExplicit" ? false : null;
  const territory = (first["country"] as string | undefined) ?? null;

  return { territory, explicitFlag };
}

// ─── Source: Last.fm ─────────────────────────────────────────────────────────

async function fetchLastfm(title: string, artist: string): Promise<LastfmResult> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    throw new Error("LASTFM_API_KEY not configured");
  }

  const params = new URLSearchParams({
    method: "track.getInfo",
    api_key: apiKey,
    artist,
    track: title,
    format: "json",
  });
  const url = `https://ws.audioscrobbler.com/2.0/?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Last.fm HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  const track = data["track"] as Record<string, unknown> | undefined;
  const toptags = track?.["toptags"] as Record<string, unknown> | undefined;
  const tagList = toptags?.["tag"] as Array<{ name: string }> | undefined;
  const tags = tagList?.map((t) => t.name).filter(Boolean) ?? [];
  const listeners = (track?.["listeners"] as string | undefined) ?? null;

  return { tags, listeners };
}

// ─── Source: TheAudioDB ───────────────────────────────────────────────────────

async function fetchTheAudioDb(title: string, artist: string): Promise<TheAudioDbResult> {
  const url = `https://theaudiodb.com/api/v1/json/2/searchtrack.php?s=${encodeURIComponent(artist)}&t=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`TheAudioDB HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  const tracks = data["track"] as Array<Record<string, unknown>> | null;
  if (!tracks || tracks.length === 0) return {};

  const first = tracks[0];
  return {
    label: (first["strLabel"] as string | undefined) ?? null,
    genre: (first["strGenre"] as string | undefined) ?? null,
    mbId: (first["strMusicBrainzID"] as string | undefined) ?? null,
  };
}

// ─── Source: Deezer ───────────────────────────────────────────────────────────

async function fetchDeezer(title: string, artist: string): Promise<DeezerResult> {
  const q = `track:"${title}" artist:"${artist}"`;
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Deezer HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  const results = data["data"] as Array<Record<string, unknown>> | undefined;
  if (!results || results.length === 0) return {};

  const first = results[0];
  // Deezer search results do not include label in the album sub-object;
  // label is only available on the full /album/{id} endpoint. Fetch it now.
  const albumId = (first["album"] as Record<string, unknown> | undefined)?.["id"];
  let label: string | null = null;
  if (albumId) {
    try {
      const albumRes = await fetch(`https://api.deezer.com/album/${albumId}`, {
        headers: { Accept: "application/json" },
      });
      if (albumRes.ok) {
        const albumData = (await albumRes.json()) as Record<string, unknown>;
        label = (albumData["label"] as string | undefined) ?? null;
      }
    } catch {
      // soft failure — label stays null
    }
  }
  const explicitFlag = first["explicit_lyrics"] === true ? true : first["explicit_lyrics"] === false ? false : null;

  return { label, explicitFlag };
}

// ─── Source: Genius ───────────────────────────────────────────────────────────

async function fetchGenius(title: string, artist: string): Promise<GeniusResult> {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    throw new Error("GENIUS_ACCESS_TOKEN not configured");
  }

  const q = `${title} ${artist}`;
  const url = `https://api.genius.com/search?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Genius HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  const response = data["response"] as Record<string, unknown> | undefined;
  const hits = response?.["hits"] as Array<Record<string, unknown>> | undefined;
  if (!hits || hits.length === 0) return {};

  const firstHit = hits[0];
  const result = firstHit["result"] as Record<string, unknown> | undefined;
  const primaryArtist = result?.["primary_artist"] as Record<string, unknown> | undefined;
  const artistName = (primaryArtist?.["name"] as string | undefined) ?? null;

  return { artistName };
}

// ─── Source: ASCAP (HTTP scrape, may return null if JS-rendered) ──────────────

async function fetchAscap(title: string): Promise<ProResult> {
  const url = `https://www.ascap.com/repertory#ace/search/workID/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SyncVision/1.0)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`ASCAP HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // If there's no real result table, the site is JS-rendered
  const rows = $("table tr, .search-result").length;
  if (rows === 0) {
    console.log("[enrichment] ASCAP: no data (JS-rendered, skipped)");
    return { found: false };
  }

  // Try to extract data if present
  const workId = $("[data-work-id]").first().attr("data-work-id") ?? null;
  const writer = $(".writer-name").first().text().trim() || null;
  const publisher = $(".publisher-name").first().text().trim() || null;

  return { found: Boolean(workId || writer), workId, writer, publisher, proAffiliation: "ASCAP" };
}

// ─── Source: BMI (HTTP scrape, stub — JS-rendered) ───────────────────────────

async function fetchBmi(_title: string, _artist: string): Promise<ProResult> {
  // BMI repertoire requires JS rendering — HTTP-only returns an empty shell
  console.log("[enrichment] BMI: no data (JS-rendered, skipped)");
  return { found: false };
}

// ─── Source: SESAC (HTTP scrape, stub — JS-rendered) ─────────────────────────

async function fetchSesac(_title: string, _artist: string): Promise<ProResult> {
  // SESAC repertoire requires JS rendering — HTTP-only returns an empty shell
  console.log("[enrichment] SESAC: no data (JS-rendered, skipped)");
  return { found: false };
}

// ─── Main enrichment function ─────────────────────────────────────────────────

export async function enrichRightsProfile(
  trackId: string,
  title: string,
  artist: string,
  isrc: string | null
): Promise<Record<string, unknown> | null> {
  const API_TIMEOUT_MS = 5000;
  const SCRAPER_TIMEOUT_MS = 8000;

  // Fetch existing rights profile for merge fallbacks
  const existing = await prisma.rightsProfile.findUnique({ where: { trackId } });

  // Fire all lookups in parallel, each with a timeout
  const [
    mbSettled,
    discogsSettled,
    itunesSettled,
    lastfmSettled,
    theaudiodbSettled,
    deezerSettled,
    geniusSettled,
    ascapSettled,
    bmiSettled,
    sesacSettled,
    creditsSettled,
  ] = await Promise.allSettled([
    isrc
      ? withTimeout(fetchMusicBrainz(isrc), API_TIMEOUT_MS)
      : Promise.reject(new Error("No ISRC for MusicBrainz lookup")),
    withTimeout(fetchDiscogs(title, artist), API_TIMEOUT_MS),
    withTimeout(fetchItunes(title, artist), API_TIMEOUT_MS),
    withTimeout(fetchLastfm(title, artist), API_TIMEOUT_MS),
    withTimeout(fetchTheAudioDb(title, artist), API_TIMEOUT_MS),
    withTimeout(fetchDeezer(title, artist), API_TIMEOUT_MS),
    withTimeout(fetchGenius(title, artist), API_TIMEOUT_MS),
    withTimeout(fetchAscap(title), SCRAPER_TIMEOUT_MS),
    withTimeout(fetchBmi(title, artist), SCRAPER_TIMEOUT_MS),
    withTimeout(fetchSesac(title, artist), SCRAPER_TIMEOUT_MS),
    isrc
      ? withTimeout(enrichFromCreditsFm(isrc), API_TIMEOUT_MS)
      : Promise.reject(new Error("No ISRC for Credits.fm lookup")),
  ]);

  // Log individual failures (soft errors)
  const logIfFailed = (name: string, settled: PromiseSettledResult<unknown>) => {
    if (settled.status === "rejected") {
      const msg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      // Suppress expected config-missing warnings at warn level
      if (!msg.includes("not configured")) {
        console.warn(`[enrichment] ${name} failed:`, msg);
      } else {
        console.log(`[enrichment] ${name}: skipped (${msg})`);
      }
    }
  };

  logIfFailed("MusicBrainz", mbSettled);
  logIfFailed("Discogs", discogsSettled);
  logIfFailed("iTunes", itunesSettled);
  logIfFailed("Last.fm", lastfmSettled);
  logIfFailed("TheAudioDB", theaudiodbSettled);
  logIfFailed("Deezer", deezerSettled);
  logIfFailed("Genius", geniusSettled);
  logIfFailed("ASCAP", ascapSettled);
  logIfFailed("BMI", bmiSettled);
  logIfFailed("SESAC", sesacSettled);
  logIfFailed("Credits.fm", creditsSettled);

  const mb           = mbSettled.status           === "fulfilled" ? mbSettled.value           : null;
  const discogs      = discogsSettled.status       === "fulfilled" ? discogsSettled.value       : null;
  const itunes       = itunesSettled.status        === "fulfilled" ? itunesSettled.value        : null;
  const lastfm       = lastfmSettled.status        === "fulfilled" ? lastfmSettled.value        : null;
  const theaudiodb   = theaudiodbSettled.status    === "fulfilled" ? theaudiodbSettled.value    : null;
  const deezer       = deezerSettled.status        === "fulfilled" ? deezerSettled.value        : null;
  // genius is resolved but we only use it for writerName hint
  const genius       = geniusSettled.status        === "fulfilled" ? geniusSettled.value        : null;
  const ascap        = ascapSettled.status         === "fulfilled" ? ascapSettled.value         : null;
  const bmi          = bmiSettled.status           === "fulfilled" ? bmiSettled.value           : null;
  const sesac        = sesacSettled.status         === "fulfilled" ? sesacSettled.value         : null;
  const credits      = creditsSettled.status       === "fulfilled" ? creditsSettled.value       : null;

  // Check if all sources failed
  const allFailed = [
    mbSettled, discogsSettled, itunesSettled, lastfmSettled,
    theaudiodbSettled, deezerSettled, geniusSettled,
    ascapSettled, bmiSettled, sesacSettled, creditsSettled,
  ].every(s => s.status === "rejected");

  if (allFailed) {
    console.warn(`[enrichment] All sources failed for trackId=${trackId} — marking status=failed`);
    await prisma.rightsProfile.upsert({
      where: { trackId },
      create: { trackId, enrichmentStatus: "failed", enrichmentSources: [] },
      update: { enrichmentStatus: "failed" },
    });
    return null;
  }

  // Track which sources returned usable data
  const sources: string[] = [];
  if (mb && (mb.isrc || mb.writerName))                                                      sources.push("MusicBrainz");
  if (discogs && (discogs.publisherName || discogs.territory))                               sources.push("Discogs");
  if (itunes && (itunes.territory || itunes.explicitFlag != null))                           sources.push("iTunes");
  if (lastfm && lastfm.tags.length > 0)                                                      sources.push("Last.fm");
  if (theaudiodb && (theaudiodb.label || theaudiodb.genre))                                  sources.push("TheAudioDB");
  if (deezer && (deezer.label || deezer.explicitFlag != null))                               sources.push("Deezer");
  if (genius?.artistName)                                                                     sources.push("Genius");
  if (ascap?.found)                                                                           sources.push("ASCAP");
  if (bmi?.found)                                                                             sources.push("BMI");
  if (sesac?.found)                                                                           sources.push("SESAC");
  if (credits && (credits.iswc || credits.writerIpi || credits.writerName))                  sources.push("Credits.fm");

  // Resolve genreTags
  const genreTags: string[] =
    (lastfm && lastfm.tags.length > 0) ? lastfm.tags :
    (theaudiodb?.genre)                 ? [theaudiodb.genre] :
    (existing?.genreTags?.length)       ? existing.genreTags :
    [];

  // Resolve popularityScore
  const popularityScore: number | undefined =
    lastfm?.listeners ? parseInt(lastfm.listeners, 10) || undefined : undefined;

  // Determine proAffiliation
  const proAffiliation: string | null =
    ascap?.found   ? "ASCAP" :
    bmi?.found     ? "BMI"   :
    sesac?.found   ? "SESAC" :
    (existing as Record<string, unknown> | null)?.["proAffiliation"] as string | null ?? null;

  // Resolve workId
  const workId: string | null =
    ascap?.workId ?? bmi?.workId ??
    (existing as Record<string, unknown> | null)?.["workId"] as string | null ?? null;

  // Merge with priority rules
  const merged: EnrichmentResult = {
    isrc: mb?.isrc ?? (existing as Record<string, unknown> | null)?.["isrc"] as string | null ?? null,
    writerName:
      ascap?.writer ?? bmi?.writer ?? sesac?.writer ??
      credits?.writerName ??
      mb?.writerName ?? genius?.artistName ??
      existing?.writerName ?? null,
    writerIpi:
      credits?.writerIpi ??
      (existing as Record<string, unknown> | null)?.["writerIpi"] as string | null ?? null,
    publisherName:
      ascap?.publisher ?? bmi?.publisher ?? sesac?.publisher ??
      credits?.publisherName ??
      discogs?.publisherName ??
      theaudiodb?.label ??
      deezer?.label ??
      existing?.publisherName ?? null,
    territory:
      itunes?.territory ?? discogs?.territory ??
      (existing as Record<string, unknown> | null)?.["territory"] as string | null ?? null,
    explicitFlag:
      itunes?.explicitFlag ?? deezer?.explicitFlag ??
      (existing as Record<string, unknown> | null)?.["explicitFlag"] as boolean | null ?? null,
    proAffiliation,
    workId,
    iswc:
      credits?.iswc ??
      (existing as Record<string, unknown> | null)?.["iswc"] as string | null ?? null,
    genreTags,
    popularityScore: popularityScore ?? null,
    enrichmentSources: sources,
  };

  // Build the update payload
  const updateData: Record<string, unknown> = {
    enrichmentSources: merged.enrichmentSources,
    enrichedAt: new Date(),
    enrichmentStatus: "complete",
    genreTags: merged.genreTags,
  };
  if (merged.writerName      != null) updateData.writerName      = merged.writerName;
  if (merged.writerIpi       != null) updateData.writerIpi       = merged.writerIpi;
  if (merged.publisherName   != null) updateData.publisherName   = merged.publisherName;
  if (merged.territory       != null) updateData.territory       = merged.territory;
  if (merged.explicitFlag    != null) updateData.explicitFlag    = merged.explicitFlag;
  if (merged.proAffiliation  != null) updateData.proAffiliation  = merged.proAffiliation;
  if (merged.workId          != null) updateData.workId          = merged.workId;
  if (merged.iswc            != null) updateData.iswc            = merged.iswc;
  if (merged.popularityScore != null) updateData.popularityScore = merged.popularityScore;
  // Write work IDs into the PRO-specific fields that the state machine checks.
  // The generic workId field above is kept for reference, but computeRightsState
  // and evaluateRightsState both check ascapWorkId/bmiWorkId — not workId.
  if (ascap?.workId          != null) updateData.ascapWorkId     = ascap.workId;
  if (bmi?.workId            != null) updateData.bmiWorkId       = bmi.workId;

  // Also update the ISRC on the Track record if MusicBrainz resolved it
  if (mb?.isrc) {
    await prisma.track.update({
      where: { id: trackId },
      data: { isrc: mb.isrc },
    });
  }

  // Upsert RightsProfile with merged data
  const updatedProfile = await prisma.rightsProfile.upsert({
    where: { trackId },
    create: { trackId, ...updateData },
    update: updateData,
  });

  // Re-run the full state machine so enriched fields (writerName, publisherName,
  // proAffiliation, etc.) are visible to the evaluator.  computeRightsState only
  // checks 3 fields and would return UNVERIFIED even after a successful enrichment
  // that resolved writer and publisher but not a PRO work ID.
  const up = updatedProfile as Record<string, unknown>;
  const enrichEvalInput: TrackEvalInput = {
    audio_id:         trackId,
    ingestion_source: "enrichment",
    metadata: {
      isrc:       (up.isrc as string | null) ?? null,
      title,
      artistName: artist || null,
    },
    ownership: {
      masterOwnershipPct:       updatedProfile.masterOwnershipPct != null ? Number(updatedProfile.masterOwnershipPct) : null,
      masterOwnedBy:            up.masterOwnedBy as string | null ?? null,
      masterOwnershipType:      up.masterOwnershipType as string | null ?? null,
      masterVerificationSource: null,
    },
    publishing: {
      ascapWorkId:    updatedProfile.ascapWorkId    ?? null,
      bmiWorkId:      up.bmiWorkId as string | null ?? null,
      writerName:     updatedProfile.writerName     ?? null,
      writerIpi:      updatedProfile.writerIpi      ?? null,
      publisherName:  updatedProfile.publisherName  ?? null,
      proAffiliation: updatedProfile.proAffiliation ?? null,
    },
    usage_rights: {
      isOneStop:             updatedProfile.isOneStop ?? null,
      masterOwnershipSplits: null,
    },
  };
  const { state: rightsState } = evaluateRightsState(enrichEvalInput);
  const finalProfile = await prisma.rightsProfile.update({
    where: { trackId },
    data: { rightsState },
  });

  console.log(`[enrichment] trackId=${trackId} enriched from [${sources.join(", ")}] → rightsState=${rightsState}`);
  return finalProfile as unknown as Record<string, unknown>;
}
