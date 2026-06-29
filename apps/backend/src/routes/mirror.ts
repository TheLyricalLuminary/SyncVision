/**
 * Mirror Workflow routes — temp-track replacement search.
 *
 *  POST /api/mirror/catalog/:catalogId/fingerprint
 *    Batch-fingerprint all tracks in a catalog (async job, returns 202).
 *
 *  GET  /api/mirror/catalog/:catalogId/fingerprint/status/:jobId
 *    Poll fingerprinting job state.
 *
 *  POST /api/mirror/search
 *    Upload a temp-track audio file and return mirror-match results
 *    against all fingerprinted tracks in the specified catalog.
 *    Body: multipart/form-data
 *      audio      (file, required)   – temp track to replace
 *      catalogId  (string, required) – catalog to search against
 *      weights    (JSON string, opt) – MirrorWeights override
 *      topN       (number, opt)      – max results to return (default 10)
 *
 *  GET  /api/mirror/fingerprint/:trackId
 *    Retrieve the stored MirrorFingerprint for a single track.
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { randomUUID } from "crypto";
import prisma from "../lib/prisma";
import { transcodeAndAnalyze } from "../services/processAudio";
import {
  buildFingerprintData,
  buildCoarseEnvelope,
  prefilterCandidates,
  rankCandidates,
  validateWeights,
  DEFAULT_MIRROR_WEIGHTS,
  type MirrorWeights,
  type CoarseEnvelope,
} from "../scoring/mirrorMatch";
import {
  fingerprintCatalog,
  buildMirrorFingerprint,
  loadCoarseFingerprints,
  loadFullFingerprints,
} from "../services/catalogFingerprint";
import type { ForensicTimeline } from "../services/processAudio";

const router = Router();

// ── Multer: temp upload to OS tmpdir (deleted after search completes) ─────────

const mirrorUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename:    (_req, _file, cb) => cb(null, `sv_mirror_${randomUUID()}.mp3`),
  }),
  limits:     { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".mp3", ".wav", ".flac", ".aac", ".m4a"].includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}`));
  },
});

// ── In-memory fingerprinting job store ────────────────────────────────────────

interface FingerprintJob {
  status:    "pending" | "running" | "complete" | "failed";
  catalogId: string;
  force:     boolean;
  processed: number;
  skipped:   number;
  total:     number;
  errors:    string[];
  startedAt: number;
  finishedAt?: number;
}

const fingerprintJobs = new Map<string, FingerprintJob>();

async function runFingerprintJob(jobId: string): Promise<void> {
  const job = fingerprintJobs.get(jobId);
  if (!job) return;
  job.status = "running";

  try {
    // Count tracks upfront so the client can show progress
    const total = await prisma.track.count({
      where: {
        catalogId:     job.catalogId,
        audioFilePath: { not: null },
        isArchived:    false,
      },
    });
    job.total = total;

    const result = await fingerprintCatalog(job.catalogId, { force: job.force });
    job.processed  = result.processed;
    job.skipped    = result.skipped;
    job.errors     = result.errors;
    job.status     = "complete";
    job.finishedAt = Date.now();
  } catch (err) {
    job.status  = "failed";
    job.errors  = [err instanceof Error ? err.message : String(err)];
    job.finishedAt = Date.now();
  }
}

// ── POST /api/mirror/catalog/:catalogId/fingerprint ───────────────────────────

router.post(
  "/mirror/catalog/:catalogId/fingerprint",
  async (req: Request, res: Response) => {
    const { catalogId } = req.params as { catalogId: string };
    const force = req.body?.force === true || req.body?.force === "true";

    // Verify catalog exists and caller has access
    const catalog = await prisma.catalog.findUnique({
      where: { id: catalogId },
      select: { id: true },
    });
    if (!catalog) {
      res.status(404).json({ error: "catalog_not_found" });
      return;
    }

    const jobId = randomUUID();
    fingerprintJobs.set(jobId, {
      status:    "pending",
      catalogId,
      force,
      processed: 0,
      skipped:   0,
      total:     0,
      errors:    [],
      startedAt: Date.now(),
    });

    void runFingerprintJob(jobId);

    res.status(202).json({ jobId });
  },
);

// ── GET /api/mirror/catalog/:catalogId/fingerprint/status/:jobId ──────────────

router.get(
  "/mirror/catalog/:catalogId/fingerprint/status/:jobId",
  (req: Request, res: Response) => {
    const { jobId } = req.params as { jobId: string };
    const job = fingerprintJobs.get(jobId);
    if (!job) {
      res.status(404).json({ error: "job_not_found" });
      return;
    }

    res.json({
      status:     job.status,
      processed:  job.processed,
      skipped:    job.skipped,
      total:      job.total,
      errors:     job.errors,
      runtimeMs:  job.finishedAt
        ? job.finishedAt - job.startedAt
        : Date.now() - job.startedAt,
    });
  },
);

// ── POST /api/mirror/search ───────────────────────────────────────────────────

router.post(
  "/mirror/search",
  mirrorUpload.single("audio"),
  async (req: Request, res: Response) => {
    const file = req.file;
    let tmpPath: string | null = file?.path ?? null;

    try {
      if (!file) {
        res.status(400).json({ error: "no_audio", message: "Multipart 'audio' field required" });
        return;
      }

      // Parse catalogId
      const catalogId = typeof req.body?.catalogId === "string"
        ? req.body.catalogId as string
        : null;
      if (!catalogId) {
        res.status(400).json({ error: "missing_catalog_id", message: "'catalogId' field required" });
        return;
      }

      // Parse optional weights
      let weights: MirrorWeights = DEFAULT_MIRROR_WEIGHTS;
      if (req.body?.weights) {
        try {
          const parsed = JSON.parse(req.body.weights as string) as MirrorWeights;
          if (!validateWeights(parsed)) {
            res.status(400).json({
              error: "invalid_weights",
              message: "weights must sum to 1.0 (structural + energy + harmonic + dialogue)",
            });
            return;
          }
          weights = parsed;
        } catch {
          res.status(400).json({ error: "invalid_weights_json", message: "weights must be valid JSON" });
          return;
        }
      }

      const topN = Math.min(
        50,
        Math.max(1, parseInt(req.body?.topN as string ?? "10", 10) || 10),
      );

      // Step 1: Analyze the temp track
      const analysis = await transcodeAndAnalyze(file.path, 25);
      const queryTimeline = analysis.forensicTimeline;

      // Step 2: Build query coarse envelope for pre-filtering
      const queryCoarse: CoarseEnvelope = {
        subZero:        buildCoarseEnvelope(queryTimeline.subZero),
        zeroPocketZone: buildCoarseEnvelope(queryTimeline.zeroPocketZone),
        presence:       buildCoarseEnvelope(queryTimeline.presence),
        cmamTension:    buildCoarseEnvelope(queryTimeline.cmamTension),
      };

      // Step 3: Load all coarse fingerprints for this catalog
      const allCoarse = await loadCoarseFingerprints(catalogId);
      if (allCoarse.length === 0) {
        res.json({
          query: {
            durationSeconds: analysis.durationSeconds,
            inputHash:       analysis.inputHash,
            fps:             analysis.fps,
          },
          results:  [],
          message:  "No fingerprinted tracks found in this catalog. Run POST /api/mirror/catalog/:id/fingerprint first.",
        });
        return;
      }

      // Step 4: Pre-filter to top 50 candidates using coarse envelopes
      const preFiltered = prefilterCandidates(queryCoarse, allCoarse, 50);

      // Step 5: Load full timelines for pre-filtered candidates
      const fullFingerprints = await loadFullFingerprints(
        preFiltered.map(fp => fp.trackId),
      );

      // Step 6: Full ranking with cross-correlation on complete timelines
      const candidates = fullFingerprints.map(fp => ({
        trackId:      fp.trackId,
        trackTitle:   fp.trackTitle,
        artistName:   fp.artistName,
        fps:          fp.fps,
        inputHash:    fp.inputHash,
        fullTimeline: fp.fullTimeline,
      }));

      const ranked = rankCandidates(
        queryTimeline,
        analysis.inputHash,
        candidates,
        weights,
      );

      res.json({
        query: {
          durationSeconds: analysis.durationSeconds,
          inputHash:       analysis.inputHash,
          fps:             analysis.fps,
          sampleRate:      analysis.sampleRate,
        },
        weights,
        catalogSize:         allCoarse.length,
        preFilteredCount:    preFiltered.length,
        results:             ranked.slice(0, topN),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mirror search failed";
      console.error("[mirror/search]", err);
      res.status(500).json({ error: "search_failed", message });
    } finally {
      // Always delete the temp file, even on error
      if (tmpPath && fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
      }
    }
  },
);

// ── GET /api/mirror/fingerprint/:trackId ─────────────────────────────────────

router.get(
  "/mirror/fingerprint/:trackId",
  async (req: Request, res: Response) => {
    const { trackId } = req.params as { trackId: string };

    const fp = await prisma.mirrorFingerprint.findUnique({
      where:  { trackId },
      select: {
        id:              true,
        trackId:         true,
        coarseEnvelope:  true,
        bandStats:       true,
        durationSeconds: true,
        frameCount:      true,
        fps:             true,
        inputHash:       true,
        modelVersion:    true,
        createdAt:       true,
        updatedAt:       true,
      },
    });

    if (!fp) {
      res.status(404).json({ error: "fingerprint_not_found" });
      return;
    }

    res.json(fp);
  },
);

// ── POST /api/mirror/fingerprint/:trackId (single-track fingerprint) ──────────

router.post(
  "/mirror/fingerprint/:trackId",
  async (req: Request, res: Response) => {
    const { trackId } = req.params as { trackId: string };
    const force = req.body?.force === true || req.body?.force === "true";

    try {
      await buildMirrorFingerprint(trackId, { force });
      const fp = await prisma.mirrorFingerprint.findUnique({
        where:  { trackId },
        select: { id: true, inputHash: true, frameCount: true, modelVersion: true },
      });
      res.json({ ok: true, fingerprint: fp });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fingerprinting failed";
      res.status(500).json({ error: "fingerprint_failed", message });
    }
  },
);

export default router;
