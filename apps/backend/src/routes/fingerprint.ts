// POST /api/tracks/:id/fingerprint
//
// Primary: AudD API — sends the audio file, returns artist/title/ISRC like Shazam.
//          Works with degraded audio, screen recordings, MP3s.
// Fallback: AcoustID (fpcalc + chromaprint) if AUDD_API_TOKEN not set.

import { Router, Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";
import { enrichFromMusicBrainz } from "../lib/musicbrainz";
import { enrichFromCreditsFm } from "../lib/creditsfm";
import { enrichFromMusixmatch } from "../lib/musixmatch";

const router = Router();

const AUDIO_DIR = path.resolve(__dirname, "../../audio");
const UPLOAD_DIR = process.env.AUDIO_STORAGE_PATH ?? AUDIO_DIR;
const FPCALC_BIN = process.env.FPCALC_BIN ?? "fpcalc";
const ACOUSTID_APP_ID = process.env.ACOUSTID_APP_ID ?? "";
const ACOUSTID_API = "https://api.acoustid.org/v2/lookup";
const AUDD_API_TOKEN = process.env.AUDD_API_TOKEN ?? "";
const AUDD_API = "https://api.audd.io/";

// ── AudD ─────────────────────────────────────────────────────────────────────

interface AudDResult {
  artist: string;
  title: string;
  album?: string;
  release_date?: string;
  label?: string;
  timecode?: string;
  song_link?: string;
  apple_music?: { isrc?: string };
  spotify?: { external_ids?: { isrc?: string } };
  musicbrainz?: Array<{ id: string }>;
}

async function queryAudD(audioPath: string, apiToken: string): Promise<AudDResult | null> {
  // Use Node 20 native FormData + Blob — compatible with built-in fetch.
  // The npm form-data package uses Node streams which native fetch can't pipe.
  const fileBuffer = fs.readFileSync(audioPath);
  const blob = new Blob([fileBuffer]);
  const form = new FormData();
  form.append("api_token", apiToken);
  form.append("file", blob, path.basename(audioPath));
  form.append("return", "musicbrainz,apple_music,spotify");

  const res = await fetch(AUDD_API, { method: "POST", body: form });

  if (!res.ok) throw new Error(`AudD API ${res.status}`);
  const body = await res.json() as { status: string; result?: AudDResult; error?: { error_code: number; error_message: string } };
  if (body.status !== "success") {
    console.warn("[fingerprint] AudD no match:", body.error?.error_message ?? body.status);
    return null;
  }
  return body.result ?? null;
}

// ── AcoustID fallback ─────────────────────────────────────────────────────────

interface FpcalcResult { fingerprint: string; duration: number; }

function runFpcalc(audioPath: string): Promise<FpcalcResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(FPCALC_BIN, ["-json", audioPath]);
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.on("close", (code) => {
      if (code !== 0) { reject(new Error(`fpcalc exited ${code}`)); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as FpcalcResult); }
      catch (e) { reject(new Error(`fpcalc invalid JSON: ${String(e)}`)); }
    });
    proc.on("error", (e) => reject(new Error(`fpcalc not available: ${e.message}`)));
  });
}

interface AcoustIDResult {
  id: string; score: number;
  recordings?: Array<{ id: string; title?: string; artists?: { name: string }[]; releasegroups?: { title?: string }[] }>;
}

async function queryAcoustID(fingerprint: string, duration: number, appId: string): Promise<AcoustIDResult[]> {
  const url = new URL(ACOUSTID_API);
  url.searchParams.set("client", appId);
  url.searchParams.set("meta", "recordings+releasegroups");
  url.searchParams.set("duration", String(Math.round(duration)));
  url.searchParams.set("fingerprint", fingerprint);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`AcoustID API ${res.status}`);
  const body = await res.json() as { status: string; results?: AcoustIDResult[] };
  if (body.status !== "ok") throw new Error(`AcoustID status: ${body.status}`);
  return body.results ?? [];
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post("/tracks/:id/fingerprint", async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!AUDD_API_TOKEN && !ACOUSTID_APP_ID) {
    res.status(503).json({
      error: "fingerprint_unavailable",
      message: "Neither AUDD_API_TOKEN nor ACOUSTID_APP_ID is configured",
      stage: "PENDING_CONFIG",
    });
    return;
  }

  try {
    const track = await prisma.track.findUnique({ where: { id: id as string } });
    if (!track) { res.status(404).json({ error: "Track not found" }); return; }

    const filename = track.audioFilePath ? path.basename(track.audioFilePath) : null;
    if (!filename) { res.status(409).json({ error: "No audio file attached" }); return; }

    const audioPath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(audioPath)) {
      res.status(409).json({ error: "Audio file not found on disk", filename });
      return;
    }

    // ── Primary: AudD ────────────────────────────────────────────
    let auddResult: AudDResult | null = null;
    if (AUDD_API_TOKEN) {
      try {
        auddResult = await queryAudD(audioPath, AUDD_API_TOKEN);
      } catch (e) {
        console.warn("[fingerprint] AudD failed:", e instanceof Error ? e.message : e);
      }
    }

    // ── Fallback: AcoustID ────────────────────────────────────────
    let acoustidTopId: string | null = null;
    let acoustidScore = 0;
    let acoustidMbid: string | null = null;
    let acoustidTitle: string | null = null;
    let acoustidArtist: string | null = null;

    if (!auddResult && ACOUSTID_APP_ID) {
      try {
        const fpcalcResult = await runFpcalc(audioPath);
        const results = await queryAcoustID(fpcalcResult.fingerprint, fpcalcResult.duration, ACOUSTID_APP_ID);
        const top = results[0] ?? null;
        acoustidTopId   = top?.id ?? null;
        acoustidScore   = top?.score ?? 0;
        const rec       = top?.recordings?.[0] ?? null;
        acoustidMbid    = rec?.id ?? null;
        acoustidTitle   = rec?.title ?? null;
        acoustidArtist  = rec?.artists?.[0]?.name ?? null;
      } catch (e) {
        console.warn("[fingerprint] AcoustID fallback failed:", e instanceof Error ? e.message : e);
      }
    }

    // ── Determine match ───────────────────────────────────────────
    const matched = !!(auddResult || acoustidMbid);
    const matchQuality = auddResult ? "HIGH"
      : acoustidScore >= 0.9 ? "HIGH"
      : acoustidScore >= 0.7 ? "MEDIUM"
      : acoustidScore >  0   ? "LOW"
      : "NO_MATCH";

    // Resolved identity fields
    const resolvedTitle  = auddResult?.title  ?? acoustidTitle  ?? null;
    const resolvedArtist = auddResult?.artist ?? acoustidArtist ?? null;

    // ISRC: AudD returns it via apple_music or spotify sub-objects
    const auddIsrc = auddResult?.apple_music?.isrc
      ?? auddResult?.spotify?.external_ids?.isrc
      ?? null;

    // MusicBrainz recording ID
    const mbRecordingId = auddResult?.musicbrainz?.[0]?.id ?? acoustidMbid ?? null;

    // ── MusicBrainz enrichment ────────────────────────────────────
    let mbEnrichment = null;
    if (mbRecordingId && matched) {
      try {
        mbEnrichment = await enrichFromMusicBrainz(mbRecordingId);
      } catch { /* non-fatal */ }
    }

    // ── Credits.fm enrichment ─────────────────────────────────────
    const resolvedIsrc = auddIsrc ?? mbEnrichment?.isrc ?? track.isrc ?? null;
    let creditsEnrichment = null;
    if (resolvedIsrc) {
      try {
        creditsEnrichment = await enrichFromCreditsFm(resolvedIsrc);
      } catch { /* non-fatal */ }
    }

    // ── Musixmatch lyrics linkage ─────────────────────────────────
    let lyricsData = null;
    try {
      lyricsData = await enrichFromMusixmatch({
        isrc:   resolvedIsrc,
        artist: resolvedArtist,
        title:  resolvedTitle,
      });
    } catch { /* non-fatal */ }

    // ── Persist identity ──────────────────────────────────────────
    try {
      await prisma.track.update({
        where: { id: id as string },
        data: {
          acoustidId:        acoustidTopId,
          acoustidScore:     acoustidScore,
          acoustidCheckedAt: new Date(),
        },
      });
    } catch (e) {
      console.warn("[fingerprint] persist skipped:", e instanceof Error ? e.message : e);
    }

    // ── Reconciliation diff ───────────────────────────────────────
    const discrepancies: { field: string; submitted: string | null; external: string | null }[] = [];
    if (resolvedTitle  && track.title      && resolvedTitle.toLowerCase()  !== track.title.toLowerCase())
      discrepancies.push({ field: "title",      submitted: track.title,      external: resolvedTitle });
    if (resolvedArtist && track.artistName && resolvedArtist.toLowerCase() !== track.artistName.toLowerCase())
      discrepancies.push({ field: "artistName", submitted: track.artistName, external: resolvedArtist });

    // ── autoFill ──────────────────────────────────────────────────
    const enrichmentSources: string[] = [];
    if (matched) enrichmentSources.push(auddResult ? "AudD" : "AcoustID");
    if (mbEnrichment?.writerName || mbEnrichment?.publisherName || mbEnrichment?.isrc) enrichmentSources.push("MusicBrainz");
    if (creditsEnrichment?.writerName || creditsEnrichment?.publisherName) enrichmentSources.push("Credits.fm");
    if (lyricsData?.hasLyrics) enrichmentSources.push("Musixmatch");

    const autoFill = {
      isrc:           resolvedIsrc,
      iswc:           creditsEnrichment?.iswc        ?? mbEnrichment?.iswc        ?? null,
      writerName:     creditsEnrichment?.writerName  ?? mbEnrichment?.writerName  ?? null,
      writerIpi:      creditsEnrichment?.writerIpi   ?? mbEnrichment?.writerIpi   ?? null,
      publisherName:  creditsEnrichment?.publisherName ?? mbEnrichment?.publisherName ?? null,
      proAffiliation: creditsEnrichment?.proAffiliation ?? null,
      enrichmentSources,
      sources: {
        isrc:      auddIsrc ? "audd" : mbEnrichment?.isrc ? "musicbrainz" : track.isrc ? "submitted" : null,
        writer:    creditsEnrichment?.writerName    ? "credits.fm" : mbEnrichment?.writerName    ? "musicbrainz" : null,
        publisher: creditsEnrichment?.publisherName ? "credits.fm" : mbEnrichment?.publisherName ? "musicbrainz" : null,
        pro:       creditsEnrichment?.proAffiliation ? "credits.fm" : null,
      },
      lyricsLinkage: lyricsData ? {
        hasLyrics: lyricsData.hasLyrics,
        explicit:  lyricsData.explicit,
        url:       lyricsData.url,
        isrc:      lyricsData.isrc,
        source:    "musixmatch",
      } : null,
    };

    res.json({
      provider:     auddResult ? "audd" : "acoustid",
      acoustidId:   acoustidTopId,
      score:        auddResult ? 1.0 : acoustidScore,
      matchQuality,
      topRecording: matched ? {
        id:       mbRecordingId,
        title:    resolvedTitle,
        artist:   resolvedArtist,
        album:    auddResult?.album ?? null,
        releases: [],
      } : null,
      discrepancies,
      autoFill,
      reconciliationNote:
        discrepancies.length > 0
          ? `Metadata discrepancy detected on ${discrepancies.map(d => d.field).join(", ")}.`
          : matchQuality === "NO_MATCH"
          ? "No external match found. Identity unresolved."
          : "Submitted metadata consistent with external registry.",
    });
  } catch (err) {
    console.error("[fingerprint]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
