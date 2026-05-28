/**
 * Rights Enrichment Pipeline
 *
 * Fires parallel lookups against MusicBrainz, Discogs, iTunes, and Last.fm,
 * merges results with priority rules, persists the merged data, and
 * re-runs the rights state machine.
 *
 * All source failures are soft — the pipeline continues if one or more
 * sources are unavailable. Returns null only when ALL sources fail.
 */

import prisma from "../lib/prisma";
import { computeRightsState } from "../scoring/rightsStateMachine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnrichmentResult {
  isrc?: string | null;
  writerName?: string | null;
  publisherName?: string | null;
  territory?: string | null;
  explicitFlag?: boolean | null;
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

// ─── Timeout helper ───────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
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
    console.warn("[enrichment] DISCOGS_TOKEN not set — skipping Discogs lookup");
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
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  const results = data["results"] as Array<Record<string, unknown>> | undefined;
  if (!results || results.length === 0) return {};

  const first = results[0];
  const publisherName = (first["collectionName"] as string | undefined) ?? null;
  const explicitness = first["trackExplicitness"] as string | undefined;
  const explicitFlag = explicitness === "explicit" ? true : explicitness === "notExplicit" ? false : null;
  const territory = (first["country"] as string | undefined) ?? null;

  return { publisherName, territory, explicitFlag };
}

// ─── Source: Last.fm ─────────────────────────────────────────────────────────

async function fetchLastfm(title: string, artist: string): Promise<{ tags: string[] }> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    console.warn("[enrichment] LASTFM_API_KEY not set — skipping Last.fm lookup");
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

  return { tags };
}

// ─── Main enrichment function ─────────────────────────────────────────────────

export async function enrichRightsProfile(
  trackId: string,
  title: string,
  artist: string,
  isrc: string | null
): Promise<Record<string, unknown> | null> {
  const TIMEOUT_MS = 5000;

  // Fetch existing rights profile for merge fallbacks
  const existing = await prisma.rightsProfile.findUnique({ where: { trackId } });

  // Fire all lookups in parallel, each with a timeout
  const [mbSettled, discogsSettled, itunesSettled, lastfmSettled] = await Promise.allSettled([
    isrc
      ? withTimeout(fetchMusicBrainz(isrc), TIMEOUT_MS)
      : Promise.reject(new Error("No ISRC for MusicBrainz lookup")),
    withTimeout(fetchDiscogs(title, artist), TIMEOUT_MS),
    withTimeout(fetchItunes(title, artist), TIMEOUT_MS),
    withTimeout(fetchLastfm(title, artist), TIMEOUT_MS),
  ]);

  // Log individual failures (soft errors)
  if (mbSettled.status === "rejected") {
    console.warn("[enrichment] MusicBrainz failed:", mbSettled.reason instanceof Error ? mbSettled.reason.message : mbSettled.reason);
  }
  if (discogsSettled.status === "rejected") {
    console.warn("[enrichment] Discogs failed:", discogsSettled.reason instanceof Error ? discogsSettled.reason.message : discogsSettled.reason);
  }
  if (itunesSettled.status === "rejected") {
    console.warn("[enrichment] iTunes failed:", itunesSettled.reason instanceof Error ? itunesSettled.reason.message : itunesSettled.reason);
  }
  if (lastfmSettled.status === "rejected") {
    console.warn("[enrichment] Last.fm failed:", lastfmSettled.reason instanceof Error ? lastfmSettled.reason.message : lastfmSettled.reason);
  }

  // If all failed, bail out — leave existing data unchanged
  const allFailed =
    mbSettled.status === "rejected" &&
    discogsSettled.status === "rejected" &&
    itunesSettled.status === "rejected" &&
    lastfmSettled.status === "rejected";

  if (allFailed) {
    console.warn(`[enrichment] All sources failed for trackId=${trackId} — leaving data unchanged`);
    return null;
  }

  const mb = mbSettled.status === "fulfilled" ? mbSettled.value : null;
  const discogs = discogsSettled.status === "fulfilled" ? discogsSettled.value : null;
  const itunes = itunesSettled.status === "fulfilled" ? itunesSettled.value : null;

  // Track which sources returned usable data
  const sources: string[] = [];
  if (mb && (mb.isrc || mb.writerName)) sources.push("MusicBrainz");
  if (discogs && (discogs.publisherName || discogs.territory)) sources.push("Discogs");
  if (itunes && (itunes.publisherName || itunes.territory || itunes.explicitFlag != null)) sources.push("iTunes");
  if (lastfmSettled.status === "fulfilled" && lastfmSettled.value.tags.length > 0) sources.push("Last.fm");

  // Merge with priority rules
  const merged: EnrichmentResult = {
    isrc: mb?.isrc ?? existing?.["isrc" as keyof typeof existing] as string | null ?? null,
    writerName: mb?.writerName ?? existing?.writerName ?? null,
    publisherName: discogs?.publisherName ?? itunes?.publisherName ?? existing?.publisherName ?? null,
    territory: itunes?.territory ?? discogs?.territory ?? (existing as Record<string, unknown> | null)?.["territory"] as string | null ?? null,
    explicitFlag: itunes?.explicitFlag ?? (existing as Record<string, unknown> | null)?.["explicitFlag"] as boolean | null ?? null,
    enrichmentSources: sources,
  };

  // Build the update payload — only set fields that have values
  const updateData: Record<string, unknown> = {
    enrichmentSources: merged.enrichmentSources,
    enrichedAt: new Date(),
  };
  if (merged.writerName != null) updateData.writerName = merged.writerName;
  if (merged.publisherName != null) updateData.publisherName = merged.publisherName;
  if (merged.territory != null) updateData.territory = merged.territory;
  if (merged.explicitFlag != null) updateData.explicitFlag = merged.explicitFlag;

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
    create: {
      trackId,
      ...updateData,
    },
    update: updateData,
  });

  // Re-run the rights state machine with updated profile
  const rightsState = computeRightsState(updatedProfile);
  const finalProfile = await prisma.rightsProfile.update({
    where: { trackId },
    data: { rightsState },
  });

  console.log(`[enrichment] trackId=${trackId} enriched from [${sources.join(", ")}] → rightsState=${rightsState}`);
  return finalProfile as unknown as Record<string, unknown>;
}
