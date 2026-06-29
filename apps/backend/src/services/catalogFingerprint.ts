/**
 * Catalog Fingerprint Service
 *
 * Builds and stores MirrorFingerprint records for catalog tracks.
 * Each track is analyzed once; subsequent calls skip already-fingerprinted
 * tracks unless `force: true` is passed.
 *
 * The fingerprint contains:
 *   - coarseEnvelope  (16-bin mean-per-chunk per band) — for fast pre-filtering
 *   - bandStats       (mean, std, p10/50/90 per band)
 *   - fullTimeline    (complete ForensicTimeline)  — for detailed scoring
 *   - durationSeconds, frameCount, fps, inputHash, modelVersion
 */

import path from "path";
import prisma from "../lib/prisma";
import { transcodeAndAnalyze } from "./processAudio";
import {
  buildFingerprintData,
  type MirrorFingerprintData,
  type CoarseEnvelope,
} from "../scoring/mirrorMatch";
import type { ForensicTimeline } from "./processAudio";

const UPLOAD_DIR = process.env.AUDIO_STORAGE_PATH
  ?? path.resolve(__dirname, "../../../audio");

/** Convert the stored /audio/<name>.mp3 URL to an absolute filesystem path. */
function resolveAudioPath(audioFilePath: string): string {
  return path.join(UPLOAD_DIR, path.basename(audioFilePath));
}

// ── Type guard helpers for DB Json fields ─────────────────────────────────────

function asCoarseEnvelope(raw: unknown): CoarseEnvelope {
  const r = raw as Record<string, number[]>;
  return {
    subZero:        r.subZero        ?? [],
    zeroPocketZone: r.zeroPocketZone ?? [],
    presence:       r.presence       ?? [],
    cmamTension:    r.cmamTension    ?? [],
  };
}

function asForensicTimeline(raw: unknown): ForensicTimeline {
  const r = raw as Record<string, number[]>;
  return {
    subZero:         r.subZero         ?? [],
    zeroPocketZone:  r.zeroPocketZone  ?? [],
    presence:        r.presence        ?? [],
    highFidelityAir: r.highFidelityAir ?? [],
    cmamTension:     r.cmamTension     ?? [],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build and persist a MirrorFingerprint for a single track.
 *
 * Skips silently when a fingerprint already exists (idempotent).
 * Pass `force: true` to overwrite an existing fingerprint.
 */
export async function buildMirrorFingerprint(
  trackId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: { id: true, audioFilePath: true, modelVersion: true },
  });

  if (!track) throw new Error(`Track not found: ${trackId}`);
  if (!track.audioFilePath) throw new Error(`Track ${trackId} has no audioFilePath`);

  if (!opts.force) {
    const existing = await prisma.mirrorFingerprint.findUnique({
      where: { trackId },
      select: { id: true },
    });
    if (existing) return;  // already done
  }

  const absPath = resolveAudioPath(track.audioFilePath);

  // Phase-lock to 25 fps (broadcast fast-path)
  const analysis = await transcodeAndAnalyze(absPath, 25);
  const fp       = buildFingerprintData(
    analysis.forensicTimeline,
    analysis.durationSeconds,
    analysis.fps,
    analysis.inputHash,
    analysis.modelVersion,
  );

  await prisma.mirrorFingerprint.upsert({
    where: { trackId },
    create: {
      trackId,
      coarseEnvelope:  fp.coarseEnvelope as object,
      bandStats:        fp.bandStats      as object,
      fullTimeline:     fp.fullTimeline   as object,
      durationSeconds:  fp.durationSeconds,
      frameCount:       fp.frameCount,
      fps:              fp.fps,
      inputHash:        fp.inputHash,
      modelVersion:     fp.modelVersion,
    },
    update: {
      coarseEnvelope:  fp.coarseEnvelope as object,
      bandStats:        fp.bandStats      as object,
      fullTimeline:     fp.fullTimeline   as object,
      durationSeconds:  fp.durationSeconds,
      frameCount:       fp.frameCount,
      fps:              fp.fps,
      inputHash:        fp.inputHash,
      modelVersion:     fp.modelVersion,
    },
  });
}

/**
 * Batch-fingerprint all tracks in a catalog that have an audioFilePath.
 * Already-fingerprinted tracks are skipped unless `force: true`.
 */
export async function fingerprintCatalog(
  catalogId: string,
  opts: { force?: boolean } = {},
): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const tracks = await prisma.track.findMany({
    where: { catalogId, audioFilePath: { not: null }, isArchived: false },
    select: { id: true, audioFilePath: true },
  });

  let processed = 0;
  let skipped   = 0;
  const errors: string[] = [];

  for (const track of tracks) {
    try {
      const before = opts.force ? null : await prisma.mirrorFingerprint.findUnique({
        where: { trackId: track.id },
        select: { id: true },
      });

      if (before && !opts.force) {
        skipped++;
        continue;
      }

      await buildMirrorFingerprint(track.id, opts);
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${track.id}: ${msg}`);
    }
  }

  return { processed, skipped, errors };
}

export interface StoredFingerprint {
  fingerprintId: string;
  trackId:       string;
  trackTitle:    string;
  artistName:    string | null;
  fps:           number;
  inputHash:     string;
  coarseEnvelope: CoarseEnvelope;
}

export interface StoredFingerprintFull extends StoredFingerprint {
  fullTimeline:    ForensicTimeline;
  durationSeconds: number;
}

/**
 * Load coarse-only fingerprints for all tracks in a catalog.
 * Used for the fast pre-filter step during mirror search.
 */
export async function loadCoarseFingerprints(
  catalogId: string,
): Promise<StoredFingerprint[]> {
  const rows = await prisma.mirrorFingerprint.findMany({
    where: { track: { catalogId, isArchived: false } },
    select: {
      id:             true,
      trackId:        true,
      fps:            true,
      inputHash:      true,
      coarseEnvelope: true,
      track: { select: { title: true, artistName: true } },
    },
  });

  return rows.map(row => ({
    fingerprintId:  row.id,
    trackId:        row.trackId,
    trackTitle:     row.track.title,
    artistName:     row.track.artistName,
    fps:            row.fps,
    inputHash:      row.inputHash,
    coarseEnvelope: asCoarseEnvelope(row.coarseEnvelope),
  }));
}

/**
 * Load full fingerprints (including fullTimeline) for a specific set of tracks.
 * Used for the detailed scoring step on pre-filtered candidates.
 */
export async function loadFullFingerprints(
  trackIds: string[],
): Promise<StoredFingerprintFull[]> {
  if (trackIds.length === 0) return [];

  const rows = await prisma.mirrorFingerprint.findMany({
    where: { trackId: { in: trackIds } },
    select: {
      id:              true,
      trackId:         true,
      fps:             true,
      inputHash:       true,
      coarseEnvelope:  true,
      fullTimeline:    true,
      durationSeconds: true,
      track: { select: { title: true, artistName: true } },
    },
  });

  return rows.map(row => ({
    fingerprintId:   row.id,
    trackId:         row.trackId,
    trackTitle:      row.track.title,
    artistName:      row.track.artistName,
    fps:             row.fps,
    inputHash:       row.inputHash,
    coarseEnvelope:  asCoarseEnvelope(row.coarseEnvelope),
    fullTimeline:    asForensicTimeline(row.fullTimeline),
    durationSeconds: row.durationSeconds,
  }));
}
