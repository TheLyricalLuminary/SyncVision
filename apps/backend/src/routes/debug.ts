// Temporary disk-audit endpoint — read-only diagnostic, never mutates files.
// Protected by DEBUG_SECRET header so it is not publicly accessible.
// Remove this file once the disk issue is resolved.
//
// GET /api/debug/disk
//   Headers: x-debug-secret: <DEBUG_SECRET env var>
//
// Returns:
//   - totalFiles, totalBytes, byExtension breakdown
//   - files on disk with no matching Track.audioFilePath in DB (orphans)
//   - top 20 largest files on disk
//   - tracks in DB whose audioFilePath does not exist on disk (ghost records)

import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";

const router = Router();

const AUDIO_DIR = path.resolve(__dirname, "../../audio");
const UPLOAD_DIR = process.env.AUDIO_STORAGE_PATH ?? AUDIO_DIR;

router.get("/debug/disk", async (req: Request, res: Response) => {
  const secret = process.env.DEBUG_SECRET;
  if (!secret) {
    res.status(503).json({ error: "DEBUG_SECRET not configured — set it in env to enable this endpoint" });
    return;
  }
  if (req.headers["x-debug-secret"] !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // 1. Enumerate all files on disk
    let diskFiles: Array<{ filename: string; sizeBytes: number; ext: string; absPath: string }> = [];
    if (fs.existsSync(UPLOAD_DIR)) {
      const entries = fs.readdirSync(UPLOAD_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const absPath = path.join(UPLOAD_DIR, entry.name);
        try {
          const stat = fs.statSync(absPath);
          diskFiles.push({
            filename: entry.name,
            sizeBytes: stat.size,
            ext: path.extname(entry.name).toLowerCase(),
            absPath,
          });
        } catch {
          // file disappeared between readdir and stat — skip
        }
      }
    }

    // 2. Aggregate by extension
    const byExtension: Record<string, { count: number; totalBytes: number }> = {};
    for (const f of diskFiles) {
      if (!byExtension[f.ext]) byExtension[f.ext] = { count: 0, totalBytes: 0 };
      byExtension[f.ext].count++;
      byExtension[f.ext].totalBytes += f.sizeBytes;
    }

    const totalFiles = diskFiles.length;
    const totalBytes = diskFiles.reduce((sum, f) => sum + f.sizeBytes, 0);

    // 3. Cross-reference with DB — find files on disk not referenced by any Track row
    const tracks = await prisma.track.findMany({
      select: { id: true, title: true, audioFilePath: true },
    });

    // Build a set of all basenames that the DB knows about
    const dbBasenames = new Set<string>();
    for (const t of tracks) {
      if (t.audioFilePath) {
        dbBasenames.add(path.basename(t.audioFilePath));
      }
    }

    const orphanedOnDisk = diskFiles
      .filter(f => !dbBasenames.has(f.filename))
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .map(f => ({ filename: f.filename, sizeMB: +(f.sizeBytes / 1024 / 1024).toFixed(2) }));

    const orphanedTotalBytes = orphanedOnDisk.reduce((sum, f) => sum + f.sizeMB, 0);

    // 4. Top 20 largest files on disk
    const top20 = diskFiles
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, 20)
      .map(f => ({
        filename: f.filename,
        sizeMB: +(f.sizeBytes / 1024 / 1024).toFixed(2),
        inDB: dbBasenames.has(f.filename),
      }));

    // 5. Ghost records — Track rows whose audio file is missing from disk
    const diskFilenameSet = new Set(diskFiles.map(f => f.filename));
    const ghostRecords = tracks
      .filter(t => {
        if (!t.audioFilePath) return false;
        return !diskFilenameSet.has(path.basename(t.audioFilePath));
      })
      .map(t => ({ id: t.id, title: t.title, audioFilePath: t.audioFilePath }));

    // 6. Duplicate detection — same base name (ignoring UUID prefix) mapped to multiple files
    const stemMap: Record<string, string[]> = {};
    for (const f of diskFiles) {
      const stem = f.filename.replace(/^[0-9a-f]{8}_/, "").toLowerCase();
      if (!stemMap[stem]) stemMap[stem] = [];
      stemMap[stem].push(f.filename);
    }
    const duplicateGroups = Object.entries(stemMap)
      .filter(([, files]) => files.length > 1)
      .map(([stem, files]) => ({ stem, files }));

    res.json({
      uploadDir: UPLOAD_DIR,
      summary: {
        totalFiles,
        totalBytes,
        totalGB: +(totalBytes / 1024 / 1024 / 1024).toFixed(3),
        orphanedFilesCount: orphanedOnDisk.length,
        orphanedTotalMB: +orphanedTotalBytes.toFixed(2),
        ghostRecordsCount: ghostRecords.length,
        duplicateGroupsCount: duplicateGroups.length,
        dbTrackCount: tracks.length,
      },
      byExtension,
      top20LargestFiles: top20,
      orphanedOnDisk: orphanedOnDisk.slice(0, 50), // first 50, sorted by size desc
      ghostRecords,
      duplicateGroups: duplicateGroups.slice(0, 20),
    });
  } catch (err) {
    console.error("[debug/disk] error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

export default router;
