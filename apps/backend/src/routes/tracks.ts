// Batch intake routes.
//
//  GET  /api/tracks           - list all tracks with status (used by the intake screen poll)
//  POST /api/tracks/inspect   - multipart upload, mutagen scans each file, returns detected tags
//  POST /api/tracks/upload    - JSON payload, creates Track + RightsProfile and enqueues
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

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([".wav", ".mp3", ".flac"]);

function sanitizeBasename(name: string): string {
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

function resolveAudioPath(filename: unknown): string {
  if (typeof filename !== "string" || filename.length === 0) {
    throw new Error("filename is required");
  }
  const base = path.basename(filename);
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
  masterOwnedBy?: unknown;
  masterOwnershipType?: unknown;
  masterVerificationSource?: unknown;
  masterOwnershipSplits?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

router.post("/tracks/upload", requirePaidEntitlement, async (req: Request, res: Response) => {
  // ── Trial enforcement for guest users ─────────────────────────────────
  // auto-login issues SUPERVISOR JWTs to all unauthenticated visitors.
  // SUPERVISOR bypasses requirePaidEntitlement, so we enforce the trial
  // limit here for any request whose userId is "guest".
  {
    const _auth = (req as any).auth as { userId?: string } | undefined;
    const isGuest = !_auth?.userId || _auth.userId === "guest";
    if (isGuest) {
      const trialToken = req.headers["x-trial-token"] as string | undefined;
      if (!trialToken) {
        res.status(403).json({ error: "Trial token required. Start a trial or upgrade your account." });
        return;
      }
      const trial = await prisma.userTrial.findUnique({ where: { trialToken } });
      if (!trial) {
        res.status(403).json({ error: "Trial not found." });
        return;
      }
      if (new Date() > trial.expiresAt) {
        res.status(403).json({ error: "Trial expired. Upgrade to continue." });
        return;
      }
      if (trial.tracksUsed >= 3) {
        res.status(403).json({ error: "Trial track limit reached.", limit: 3 });
        return;
      }
      // Atomically increment before processing so a retry cannot bypass the limit
      await prisma.userTrial.update({
        where: { trialToken },
        data: { tracksUsed: { increment: 1 } },
      });
    }
  }

  try {
    const body = req.body as { tracks?: UploadEntry[] };
    const entries = Array.isArray(body?.tracks) ? body.tracks : null;

    if (!entries || entries.length === 0) {
      res.status(400).json({ error: "Body must be { tracks: [...] } with at least one entry." });
      return;
    }

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
      masterOwnedBy: string | null;
      masterOwnershipType: string | null;
      masterVerificationSource: string | null;
      masterOwnershipSplits: unknown[] | null;
    }> = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const filename = asString(e.filename);
      const title = asString(e.title);
      const isrc = asString(e.isrc);
      if (!filename) throw new Error(`tracks[${i}].filename is required`);
      if (!title) throw new Error(`tracks[${i}].title is required`);
      if (!isrc) throw new Error(`tracks[${i}].isrc is required`);
      if (!ISRC_RE.test(isrc)) throw new Error(`tracks[${i}].isrc "${isrc}" invalid format`);

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
        masterOwnedBy: asString(e.masterOwnedBy),
        masterOwnershipType: asString(e.masterOwnershipType),
        masterVerificationSource: asString(e.masterVerificationSource),
        masterOwnershipSplits: Array.isArray(e.masterOwnershipSplits) && e.masterOwnershipSplits.length > 0 ? e.masterOwnershipSplits : null,
      });
    }

    const STORAGE_DIR = process.env.AUDIO_STORAGE_PATH!;
    fs.mkdirSync(STORAGE_DIR, { recursive: true });

    const created: Array<{ id: string; title: string; isrc: string; status: string; error?: string }> = [];

    for (const p of prepared) {
      try {
        validateTrackIngestion({ audioFilePath: p.audioPath, title: p.title, isrc: p.isrc });

        const trackId = randomUUID();
        const ext = path.extname(p.audioPath);
        const canonicalPath = path.join(STORAGE_DIR, `${trackId}${ext}`);
        fs.copyFileSync(p.audioPath, canonicalPath);

        const track = await prisma.track.create({
          data: {
            id: trackId,
            title: p.title,
            artistName: p.artistName,
            isrc: p.isrc,
            audioFilePath: canonicalPath,
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
                masterOwnedBy: p.masterOwnedBy,
                masterOwnershipType: p.masterOwnershipType,
                masterVerifiedAt: p.masterOwnershipType ? new Date() : null,
                masterOwnershipSplits: p.masterOwnershipSplits as any ?? undefined,
              },
            },
          },
        });

        try {
          await enqueueTrack(track.id);
        } catch (enqueueErr) {
          // Rollback: remove the DB row and the uploaded file so nothing is left orphaned
          await prisma.confidenceScore.deleteMany({ where: { trackId: track.id } });
          await prisma.rightsProfile.deleteMany({ where: { trackId: track.id } });
          await prisma.track.delete({ where: { id: track.id } });
          try { fs.unlinkSync(p.audioPath); } catch { /* file may not exist */ }
          throw enqueueErr;
        }

        created.push({ id: track.id, title: track.title, isrc: track.isrc, status: "queued" });
      } catch (e) {
        // P2002 = unique constraint violation — ISRC already exists
        const code = (e as Record<string, unknown>).code;
        if (code === "P2002") {
          res.status(409).json({ error: `A track with ISRC ${p.isrc} already exists in your catalog.` });
          return;
        }
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

    const filePath = track.audioFilePath;
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
    if (!track.audioFilePath || !fs.existsSync(track.audioFilePath)) {
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

router.delete("/tracks/:id", async (req: Request, res: Response) => {
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
