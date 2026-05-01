// Batch intake routes.
//
//  GET  /api/tracks           — list all tracks with status (used by the intake screen poll)
//  POST /api/tracks/inspect   — multipart upload, mutagen scans each file, returns detected tags
//  POST /api/tracks/upload    — JSON payload, creates Track + RightsProfile and enqueues
//  POST /api/tracks/:id/retry — re-enqueue a track that has trackStatus === "failed"
//
// All four endpoints are read/write only on the new tracks they create. They
// never mutate the three legacy seed tracks beyond a status update on retry.

import { Router, Request, Response } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import prisma from "../lib/prisma";
import { enqueueTrack } from "../queue/producer";

const router = Router();

const AUDIO_DIR = path.resolve(__dirname, "../../audio");
const EXTRACTOR_SCRIPT = path.resolve(__dirname, "../../../worker/extract_metadata.py");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// Multer — disk storage in apps/backend/audio/
// Filenames are UUID-prefixed to guarantee uniqueness regardless of upload order.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set([".wav", ".mp3", ".flac"]);

function sanitizeBasename(name: string): string {
  // Strip any directory components, replace anything outside [A-Za-z0-9._-] with "_"
  const base = path.basename(name);
  return base.replace(/[^A-Za-z0-9._-]+/g, "_");
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const stem = path.basename(sanitizeBasename(file.originalname), path.extname(file.originalname));
    const prefix = randomUUID().slice(0, 8);
    cb(null, `${prefix}_${stem}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB hard cap
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) cb(null, true);
    else cb(new Error(`Unsupported file extension: ${ext}. Use .wav, .mp3, or .flac.`));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: run the mutagen-based extractor against a single file
// Returns {} on any error so a tagless or unreadable file doesn't crash inspect.
// ─────────────────────────────────────────────────────────────────────────────

function extractMetadata(audioPath: string): Promise<{ isrc?: string; title?: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const errs: Buffer[] = [];
    const proc = spawn(PYTHON_BIN, [EXTRACTOR_SCRIPT, audioPath]);

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errs.push(d));

    proc.on("close", (code) => {
      if (code === 0) {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          resolve(json);
        } catch {
          resolve({});
        }
      } else {
        console.warn(
          `extract_metadata.py exit ${code} for ${audioPath}: ${Buffer.concat(errs).toString("utf8").trim()}`
        );
        resolve({});
      }
    });

    proc.on("error", (e) => {
      console.warn(`extract_metadata.py spawn error for ${audioPath}: ${e.message}`);
      resolve({});
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Path safety: a filename supplied by the client to /upload must resolve to a
// real file inside AUDIO_DIR. No "../foo" tricks, no absolute paths.
// ─────────────────────────────────────────────────────────────────────────────

function resolveAudioPath(filename: unknown): string {
  if (typeof filename !== "string" || filename.length === 0) {
    throw new Error("filename is required");
  }
  const base = path.basename(filename); // strip any directories the client sent
  const full = path.join(AUDIO_DIR, base);
  const resolved = path.resolve(full);
  if (resolved !== full || !resolved.startsWith(AUDIO_DIR + path.sep)) {
    throw new Error("invalid filename (path traversal blocked)");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`file not found in audio dir: ${base}`);
  }
  return resolved;
}

const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tracks  — list every track with its current status
// ─────────────────────────────────────────────────────────────────────────────

router.get("/tracks", async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.track.findMany({
      orderBy: { id: "desc" },
      include: { rightsProfile: { select: { ascapWorkId: true, isOneStop: true } } },
    });

    const tracks = rows.map((t) => ({
      id: t.id,
      title: t.title,
      artistName: t.artistName,
      isrc: t.isrc,
      trackStatus: t.trackStatus,
      errorReason: t.errorReason,
      tempo: t.tempo,
      tonalCharacter: t.tonalCharacter,
      energyCharacter: t.energyCharacter,
      audioFilePath: t.audioFilePath ? path.basename(t.audioFilePath) : null,
      ascapWorkId: t.rightsProfile?.ascapWorkId ?? null,
      isOneStop: t.rightsProfile?.isOneStop ?? null,
    }));

    res.json({ tracks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tracks/inspect — multipart upload, mutagen scan, return detected tags
// Files are persisted to apps/backend/audio/ with UUID-prefixed filenames.
// No DB rows are created here — that happens in /upload after the user confirms.
// ─────────────────────────────────────────────────────────────────────────────

router.post("/tracks/inspect", upload.array("files", 50), async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "No files uploaded. Use field name 'files' (multipart)." });
      return;
    }

    const inspected = await Promise.all(
      files.map(async (f) => {
        const detected = await extractMetadata(f.path);
        return {
          filename: f.filename,                                  // server-side UUID-prefixed name
          originalName: f.originalname,                          // what the user dragged in
          sizeBytes: f.size,
          detectedTitle: detected.title ?? null,
          detectedIsrc: detected.isrc ?? null,
        };
      })
    );

    res.json({ files: inspected });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tracks/upload — finalise an inspected batch
//
// Body shape:
// {
//   tracks: [
//     {
//       filename: "abc12345_song.wav",        // must already exist in audio/
//       title: "Song",
//       isrc:  "QZTAW2534564",                // required + must match ISRC_RE
//       ascapWorkId?: string,
//       writerName?: string,
//       writerIpi?: string,
//       publisherName?: string,
//       proAffiliation?: string,
//       isOneStop?: boolean                   // defaults to false
//     },
//     ...
//   ]
// }
// ─────────────────────────────────────────────────────────────────────────────

interface UploadEntry {
  filename: unknown;
  title: unknown;
  artistName?: unknown;
  isrc: unknown;
  ascapWorkId?: unknown;
  writerName?: unknown;
  writerIpi?: unknown;
  publisherName?: unknown;
  proAffiliation?: unknown;
  isOneStop?: unknown;
  masterOwnershipPct?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

router.post("/tracks/upload", async (req: Request, res: Response) => {
  try {
    const body = req.body as { tracks?: UploadEntry[] };
    const entries = Array.isArray(body?.tracks) ? body.tracks : null;

    if (!entries || entries.length === 0) {
      res.status(400).json({ error: "Body must be { tracks: [...] } with at least one entry." });
      return;
    }

    // Validate first; if any entry fails, reject the whole batch (atomic-ish).
    const prepared: Array<{
      audioPath: string;
      filename: string;
      title: string;
      artistName: string | null;
      isrc: string;
      ascapWorkId: string | null;
      writerName: string | null;
      writerIpi: string | null;
      publisherName: string | null;
      proAffiliation: string | null;
      isOneStop: boolean;
      masterOwnershipPct: number | null;
    }> = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const filename = asString(e.filename);
      const title = asString(e.title);
      const isrc = asString(e.isrc);
      if (!filename) throw new Error(`tracks[${i}].filename is required`);
      if (!title) throw new Error(`tracks[${i}].title is required`);
      if (!isrc) throw new Error(`tracks[${i}].isrc is required (ISRC missing — track cannot be cleared)`);
      if (!ISRC_RE.test(isrc)) throw new Error(`tracks[${i}].isrc "${isrc}" is not a valid ISRC format`);

      const audioPath = resolveAudioPath(filename);

      const masterRaw = e.masterOwnershipPct;
      const masterOwnershipPct =
        typeof masterRaw === "number" ? masterRaw :
        typeof masterRaw === "string" && masterRaw.length > 0 ? parseFloat(masterRaw) :
        null;

      prepared.push({
        audioPath,
        filename: path.basename(filename),
        title,
        artistName: asString(e.artistName),
        isrc,
        ascapWorkId: asString(e.ascapWorkId),
        writerName: asString(e.writerName),
        writerIpi: asString(e.writerIpi),
        publisherName: asString(e.publisherName),
        proAffiliation: asString(e.proAffiliation),
        isOneStop: e.isOneStop === true,
        masterOwnershipPct: masterOwnershipPct !== null && !isNaN(masterOwnershipPct) ? masterOwnershipPct : null,
      });
    }

    // Create + enqueue, accumulating per-track results so the response can show
    // partial failures rather than a 500 wiping out the whole batch.
    const created: Array<{ id: string; title: string; isrc: string; status: string; error?: string }> = [];

    for (const p of prepared) {
      try {
        const track = await prisma.track.create({
          data: {
            title: p.title,
            artistName: p.artistName,
            isrc: p.isrc,
            audioFilePath: p.audioPath,
            trackStatus: "uploaded",
            rightsProfile: {
              create: {
                ascapWorkId: p.ascapWorkId,
                masterOwnershipPct: p.masterOwnershipPct,
                isOneStop: p.isOneStop,
                writerName: p.writerName,
                writerIpi: p.writerIpi,
                publisherName: p.publisherName,
                proAffiliation: p.proAffiliation,
              },
            },
          },
        });

        await enqueueTrack(track.id);

        created.push({ id: track.id, title: track.title, isrc: track.isrc, status: "queued" });
      } catch (e) {
        created.push({
          id: "",
          title: p.title,
          isrc: p.isrc,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    res.json({ tracks: created });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tracks/:id/audio — stream the raw audio file with Range support.
//
// Serves 206 Partial Content when the client sends a Range header (required for
// browser <audio> seeking) and 200 otherwise. Never loads the whole file into
// memory — always pipes a fs.createReadStream.
// ─────────────────────────────────────────────────────────────────────────────

const CONTENT_TYPES: Record<string, string> = {
  ".wav":  "audio/wav",
  ".mp3":  "audio/mpeg",
  ".flac": "audio/flac",
};

router.get("/tracks/:id/audio", async (req: Request, res: Response) => {
  const id = req.params.id as string;

  try {
    const track = await prisma.track.findUnique({ where: { id } });

    if (!track || !track.audioFilePath) {
      res.status(404).json({ error: "Track not found or audio unavailable" });
      return;
    }

    const filePath = track.audioFilePath;

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Audio file not found on disk" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    const fileSize = fs.statSync(filePath).size;

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);

    const rangeHeader = req.headers.range;

    if (!rangeHeader) {
      // Full file — 200
      res.setHeader("Content-Length", fileSize);
      res.status(200);
      fs.createReadStream(filePath).pipe(res as unknown as NodeJS.WritableStream);
      return;
    }

    // Parse "bytes=START-END" (suffix form "bytes=-N" also handled)
    const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!rangeMatch) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
      return;
    }

    const rawStart = rangeMatch[1];
    const rawEnd   = rangeMatch[2];

    let start: number;
    let end: number;

    if (rawStart === "") {
      // Suffix range: bytes=-N → last N bytes
      const suffixLen = parseInt(rawEnd, 10);
      start = Math.max(0, fileSize - suffixLen);
      end   = fileSize - 1;
    } else {
      start = parseInt(rawStart, 10);
      end   = rawEnd !== "" ? Math.min(parseInt(rawEnd, 10), fileSize - 1) : fileSize - 1;
    }

    if (start < 0 || start > end || start >= fileSize) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader("Content-Range",  `bytes ${start}-${end}/${fileSize}`);
    res.setHeader("Content-Length", chunkSize);

    fs.createReadStream(filePath, { start, end }).pipe(res as unknown as NodeJS.WritableStream);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tracks/:id/retry — re-enqueue a track that failed analysis
// Idempotent: a track already in queued/analyzing/analyzed is a no-op (200 with
// the current status). Only "failed" or "uploaded" tracks are actually re-enqueued.
// ─────────────────────────────────────────────────────────────────────────────

router.post("/tracks/:id/retry", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const track = await prisma.track.findUnique({ where: { id } });
    if (!track) {
      res.status(404).json({ error: `Track not found: ${id}` });
      return;
    }
    if (!track.audioFilePath || !fs.existsSync(track.audioFilePath)) {
      res.status(409).json({ error: "Cannot retry: audio file is missing on disk." });
      return;
    }

    if (track.trackStatus === "queued" || track.trackStatus === "analyzing") {
      res.json({ id, trackStatus: track.trackStatus, message: "Track is already in flight." });
      return;
    }
    if (track.trackStatus === "analyzed") {
      res.json({ id, trackStatus: "analyzed", message: "Track is already analyzed." });
      return;
    }

    // failed or uploaded → re-enqueue. Reset to "uploaded" and clear errorReason
    // so the consumer's idempotency check (which skips analyzed/failed) passes.
    await prisma.track.update({
      where: { id },
      data: { trackStatus: "uploaded", errorReason: null },
    });

    await enqueueTrack(id);

    res.json({ id, trackStatus: "queued" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

export default router;
