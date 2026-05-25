// POST /api/tracks/:id/fingerprint
//
// Runs fpcalc (Chromaprint) on the stored audio file, queries AcoustID,
// stores the top match, and returns a reconciliation diff against the
// track's current metadata. No side effects if fpcalc is absent.

import { Router, Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";
import prisma from "../lib/prisma";
import { enrichFromMusicBrainz } from "../lib/musicbrainz";
import { enrichFromCreditsFm } from "../lib/creditsfm";

const router = Router();

const AUDIO_DIR = path.resolve(__dirname, "../../audio");
const UPLOAD_DIR = process.env.AUDIO_STORAGE_PATH ?? AUDIO_DIR;
const FPCALC_BIN = process.env.FPCALC_BIN ?? "fpcalc";
const ACOUSTID_APP_ID = process.env.ACOUSTID_APP_ID ?? "";
const ACOUSTID_API = "https://api.acoustid.org/v2/lookup";

interface FpcalcResult {
  fingerprint: string;
  duration: number;
}

function runFpcalc(audioPath: string): Promise<FpcalcResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(FPCALC_BIN, ["-json", audioPath]);
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.on("close", (code) => {
      if (code !== 0) { reject(new Error(`fpcalc exited ${code}`)); return; }
      try {
        const out = JSON.parse(Buffer.concat(chunks).toString("utf8")) as FpcalcResult;
        resolve(out);
      } catch (e) {
        reject(new Error(`fpcalc produced invalid JSON: ${String(e)}`));
      }
    });
    proc.on("error", (e) => reject(new Error(`fpcalc not available: ${e.message}`)));
  });
}

interface AcoustIDRecording {
  id: string;
  title?: string;
  artists?: { name: string }[];
  releasegroups?: { title?: string; type?: string }[];
}

interface AcoustIDResult {
  id: string;
  score: number;
  recordings?: AcoustIDRecording[];
}

async function queryAcoustID(
  fingerprint: string,
  duration: number,
  appId: string,
): Promise<AcoustIDResult[]> {
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

router.post("/tracks/:id/fingerprint", async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!ACOUSTID_APP_ID) {
    res.status(503).json({
      error: "fingerprint_unavailable",
      message: "ACOUSTID_APP_ID not configured",
      stage: "PENDING_CONFIG",
    });
    return;
  }

  try {
    const track = await prisma.track.findUnique({ where: { id: id as string } });
    if (!track) { res.status(404).json({ error: "Track not found" }); return; }

    const filename = track.audioFilePath
      ? path.basename(track.audioFilePath)
      : null;
    if (!filename) { res.status(409).json({ error: "No audio file attached" }); return; }

    const audioPath = path.join(UPLOAD_DIR, filename);

    // ── Fingerprint ──────────────────────────────────────────────
    let fpcalcResult: FpcalcResult;
    try {
      fpcalcResult = await runFpcalc(audioPath);
    } catch (e) {
      res.status(503).json({
        error: "fingerprint_unavailable",
        message: e instanceof Error ? e.message : String(e),
        stage: "FINGERPRINT_FAILED",
      });
      return;
    }

    // ── AcoustID lookup ──────────────────────────────────────────
    const results = await queryAcoustID(
      fpcalcResult.fingerprint,
      fpcalcResult.duration,
      ACOUSTID_APP_ID,
    );

    const top = results[0] ?? null;
    const score = top?.score ?? 0;
    const topRecording = top?.recordings?.[0] ?? null;

    const matchQuality =
      score >= 0.9 ? "HIGH" :
      score >= 0.7 ? "MEDIUM" :
      score >  0   ? "LOW"    :
                     "NO_MATCH";

    // ── MusicBrainz enrichment ───────────────────────────────────
    let mbEnrichment = null;
    if (topRecording?.id && matchQuality !== "NO_MATCH") {
      try {
        mbEnrichment = await enrichFromMusicBrainz(topRecording.id);
      } catch { /* non-fatal */ }
    }

    // ── Credits.fm enrichment ────────────────────────────────────
    const resolvedIsrc = mbEnrichment?.isrc ?? track.isrc ?? null;
    let creditsEnrichment = null;
    if (resolvedIsrc) {
      try {
        creditsEnrichment = await enrichFromCreditsFm(resolvedIsrc);
      } catch { /* non-fatal */ }
    }

    // ── Persist AcoustID identity ────────────────────────────────
    // Non-fatal: if the column doesn't exist yet on this deploy, skip silently.
    try {
      await prisma.track.update({
        where: { id: id as string },
        data: {
          acoustidId:        top?.id ?? null,
          acoustidScore:     score,
          acoustidCheckedAt: new Date(),
        },
      });
    } catch (e) {
      console.warn("[fingerprint] acoustid persist skipped:", e instanceof Error ? e.message : e);
    }

    // ── Reconciliation diff ──────────────────────────────────────
    const discrepancies: { field: string; submitted: string | null; external: string | null }[] = [];

    const extTitle  = topRecording?.title ?? null;
    const extArtist = topRecording?.artists?.[0]?.name ?? null;

    if (extTitle && track.title && extTitle.toLowerCase() !== track.title.toLowerCase()) {
      discrepancies.push({ field: "title", submitted: track.title, external: extTitle });
    }
    if (extArtist && track.artistName && extArtist.toLowerCase() !== track.artistName.toLowerCase()) {
      discrepancies.push({ field: "artistName", submitted: track.artistName, external: extArtist });
    }

    // ── autoFill — translated from each layer into a single form payload ──
    // MusicBrainz: catalog translation (recording → ISRC, ISWC, composer)
    // Credits.fm:  cross-reference translation (ISRC → IPI, publisher, PRO links)
    // Neither layer decides truth. Conflicts surface to the supervisor, not the engine.
    const autoFill = {
      isrc:           resolvedIsrc,
      iswc:           creditsEnrichment?.iswc           ?? mbEnrichment?.iswc           ?? null,
      writerName:     creditsEnrichment?.writerName     ?? mbEnrichment?.writerName     ?? null,
      writerIpi:      creditsEnrichment?.writerIpi      ?? mbEnrichment?.writerIpi      ?? null,
      publisherName:  creditsEnrichment?.publisherName  ?? mbEnrichment?.publisherName  ?? null,
      proAffiliation: creditsEnrichment?.proAffiliation ?? null,
      sources: {
        isrc:      mbEnrichment?.isrc      ? "musicbrainz" : track.isrc ? "submitted" : null,
        writer:    creditsEnrichment?.writerName    ? "credits.fm" : mbEnrichment?.writerName    ? "musicbrainz" : null,
        publisher: creditsEnrichment?.publisherName ? "credits.fm" : mbEnrichment?.publisherName ? "musicbrainz" : null,
        pro:       creditsEnrichment?.proAffiliation ? "credits.fm" : null,
      },
    };

    res.json({
      acoustidId:   top?.id ?? null,
      score,
      matchQuality,
      duration:     fpcalcResult.duration,
      topRecording: topRecording
        ? {
            id:       topRecording.id,
            title:    topRecording.title ?? null,
            artist:   topRecording.artists?.[0]?.name ?? null,
            releases: topRecording.releasegroups?.map(r => r.title).filter(Boolean) ?? [],
          }
        : null,
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
