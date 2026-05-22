// Batch intake routes.
//
//  GET  /api/tracks           - list all tracks with status (used by the intake screen poll)
//  POST /api/tracks/inspect   - multipart upload, mutagen scans each file, returns detected tags
//  POST /api/tracks/upload    - multipart audio file → disk → Track record → enqueue analysis
//  POST /api/tracks/:id/retry - re-enqueue a track that has trackStatus === "failed"

import { Router, Request, Response } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import prisma from "../lib/prisma";
import { enqueueTrack } from "../queue/producer";
import { requirePlan } from "../middleware/auth";
import { computeRightsState } from "../scoring/rightsStateMachine";
import { requirePaidEntitlement } from "../middleware/entitlement";
import { validateTrackIngestion } from "../lib/validateTrackIngestion";

const router = Router();

const AUDIO_DIR = path.resolve(__dirname, "../../audio");
const EXTRACTOR_SCRIPT = path.resolve(__dirname, "../../../worker/extract_metadata.py");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";

// Use the persistent Render disk when available, fall back to local audio dir.
const UPLOAD_DIR = process.env.AUDIO_STORAGE_PATH ?? AUDIO_DIR;
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([".wav", ".mp3", ".flac"]);

function sanitizeBasename(name: string): string {
  const base = path.basename(name);
  return base.replace(/[^A-Za-z0-9._-]+/g, "_");
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const stem = path.basename(sanitizeBasename(file.originalname), path.extname(file.originalname));
    const prefix = randomUUID().slice(0, 8);
    cb(null, `${prefix}_${stem}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) cb(null, true);
    else cb(new Error(`Unsupported file extension: ${ext}. Use .wav, .mp3, or .flac.`));
  },
});

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
        console.warn(`extract_metadata.py exit ${code} for ${audioPath}`);
        resolve({});
      }
    });

    proc.on("error", (e) => {
      console.warn(`extract_metadata.py spawn error: ${e.message}`);
      resolve({});
    });
  });
}

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

router.post("/tracks/inspect", upload.array("files", 50), async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "No files uploaded." });
      return;
    }

    const inspected = await Promise.all(
      files.map(async (f) => {
        const detected = await extractMetadata(f.path);
        return {
          filename: f.filename,
          originalName: f.originalname,
          sizeBytes: f.size,
          detectedTitle: (() => {
            const t = detected.title ?? null;
            // underscores with no spaces = filename, not a real tag — return null
            if (t && t.includes("_") && !t.includes(" ")) return null;
            return t;
          })(),
          detectedIsrc: detected.isrc ?? null,
        };
      })
    );

    res.json({ files: inspected });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Single canonical ingestion endpoint:
//   multipart "audio" file → disk → Track row → (best-effort) enqueue
//
// Responds with { filename, originalName, sizeBytes } so the IngestScreen
// can hand the saved filename to /api/analysis/submit.
router.post("/tracks/upload", (req: Request, res: Response) => {
  upload.single("audio")(req, res, async (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(400).json({ error: message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const savedAbsPath = req.file.path;
    const savedFilename = req.file.filename;
    const originalName = req.file.originalname;
    const title = path.basename(originalName, path.extname(originalName)) || savedFilename;
    const isrc = `PILOT-${randomUUID()}`;

    try {
      validateTrackIngestion({ audioFilePath: savedAbsPath, title, isrc });

      const track = await prisma.track.create({
        data: {
          title,
          isrc,
          audioFilePath: savedFilename,
          trackStatus: "uploaded",
        },
      });

      // Best-effort: enqueue requires Redis. When absent (pilot), inline
      // analysis runs via /api/analysis/submit instead.
      try {
        await enqueueTrack(track.id);
      } catch (enqueueErr) {
        console.warn(
          "[tracks/upload] enqueueTrack skipped:",
          enqueueErr instanceof Error ? enqueueErr.message : enqueueErr,
        );
      }

      res.json({
        filename: savedFilename,
        originalName,
        sizeBytes: req.file.size,
        trackId: track.id,
      });
    } catch (e) {
      try { fs.unlinkSync(savedAbsPath); } catch { /* nothing to clean up */ }
      const message = e instanceof Error ? e.message : "Upload processing failed";
      res.status(400).json({ error: message });
    }
  });
});

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
      res.status(404).json({ error: "Track not found" });
      return;
    }

    const storageDir = process.env.AUDIO_STORAGE_PATH ?? AUDIO_DIR;
    const filename = path.basename(track.audioFilePath);
    const filePath = path.join(storageDir, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    const fileSize = fs.statSync(filePath).size;

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);

    const rangeHeader = req.headers.range as string | undefined;

    if (!rangeHeader) {
      res.setHeader("Content-Length", fileSize);
      res.status(200);
      fs.createReadStream(filePath).pipe(res as any);
      return;
    }

    const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!rangeMatch) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
      return;
    }

    const rawStart = rangeMatch[1];
    const rawEnd   = rangeMatch[2];
    let start = rawStart === "" ? Math.max(0, fileSize - parseInt(rawEnd, 10)) : parseInt(rawStart, 10);
    let end = rawEnd !== "" ? Math.min(parseInt(rawEnd, 10), fileSize - 1) : fileSize - 1;

    if (start < 0 || start > end || start >= fileSize) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
      return;
    }

    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    res.setHeader("Content-Length", end - start + 1);
    fs.createReadStream(filePath, { start, end }).pipe(res as any);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/tracks/:id/retry", requirePaidEntitlement, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const track = await prisma.track.findUnique({ where: { id } });
    if (!track) {
      res.status(404).json({ error: `Track not found: ${id}` });
      return;
    }
    const retryStorageDir = process.env.AUDIO_STORAGE_PATH ?? AUDIO_DIR;
    const retryFilePath = track.audioFilePath && (path.isAbsolute(track.audioFilePath)
      ? track.audioFilePath
      : path.join(retryStorageDir, track.audioFilePath));
    if (!retryFilePath || !fs.existsSync(retryFilePath)) {
      res.status(409).json({ error: "Audio file is missing." });
      return;
    }

    if (track.trackStatus === "queued" || track.trackStatus === "analyzing") {
      res.json({ id, trackStatus: track.trackStatus, message: "Already in flight." });
      return;
    }

    await prisma.track.update({
      where: { id },
      data: { trackStatus: "uploaded", errorReason: null },
    });

    await enqueueTrack(id);
    res.json({ id, trackStatus: "queued" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tracks/:id/rights-report", requirePlan("AGENCY"), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const track = await prisma.track.findUnique({
      where: { id: id as string },
      include: { rightsProfile: true, confidenceScore: true },
    });

    if (!track) {
      res.status(404).json({ error: "Track not found" });
      return;
    }

    const rp = track.rightsProfile;
    const cs = track.confidenceScore;
    const rightsState = computeRightsState(rp);

    const OWNERSHIP_LABELS: Record<string, string> = {
      SELF_OWNED: "Self-Owned (artist controls master)",
      LABEL: "Label-Owned",
      CO_OWNED: "Co-Owned",
      WORK_FOR_HIRE: "Work-for-Hire",
    };

    const STATE_LABELS: Record<string, string> = {
      CLEAR: "CLEAR",
      PARTIALLY_CLEAR: "PARTIALLY CLEAR",
      UNVERIFIED: "UNVERIFIED",
      INGESTED: "INGESTED",
      BLOCKED: "BLOCKED",
    };

    const report = {
      generatedAt: new Date().toISOString(),
      track: {
        id: track.id,
        title: track.title,
        artistName: track.artistName ?? null,
        isrc: track.isrc,
        modelVersion: track.modelVersion ?? null,
      },
      rightsState: {
        verdict: rightsState,
        label: STATE_LABELS[rightsState] ?? rightsState,
      },
      publishing: {
        ascapWorkId: rp?.ascapWorkId ?? null,
        writerName: rp?.writerName ?? null,
        writerIpi: rp?.writerIpi ?? null,
        publisherName: rp?.publisherName ?? null,
        proAffiliation: rp?.proAffiliation ?? null,
        isOneStop: rp?.isOneStop ?? false,
      },
      master: {
        masterOwnedBy: rp?.masterOwnedBy ?? null,
        ownershipType: rp?.masterOwnershipType ?? null,
        ownershipTypeLabel: rp?.masterOwnershipType ? OWNERSHIP_LABELS[rp.masterOwnershipType] : null,
        ownershipPct: rp?.masterOwnershipPct ?? null,
        verifiedAt: rp?.masterVerifiedAt ?? null,
        ownershipSplits: rp?.masterOwnershipSplits ?? null,
      },
      confidence: cs ? { score: cs.score, label: cs.confidenceLabel } : null,
    };

    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/tracks/:id — remove a track and all associated rows
// ─────────────────────────────────────────────────────────────────────────────

router.delete("/tracks/:id", requirePlan("SUPERVISOR"), async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  try {
    const track = await prisma.track.findUnique({ where: { id } });
    if (!track) {
      res.status(404).json({ error: `Track not found: ${id}` });
      return;
    }

    await prisma.confidenceScore.deleteMany({ where: { trackId: id } });
    await prisma.rightsProfile.deleteMany({ where: { trackId: id } });
    await prisma.track.delete({ where: { id } });

    res.json({ deleted: id, title: track.title, isrc: track.isrc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

export default router;
