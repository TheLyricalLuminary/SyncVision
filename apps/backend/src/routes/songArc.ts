/**
 * GET /api/tracks/:trackId/arc
 *
 * Reduce the track's stored 512-point audio timeline into a 4-phase SongArc.
 * Pure read — no writes, no quota, same auth gate as other track reads.
 * Returns 404 if track doesn't exist, 422 if timeline hasn't been analysed yet.
 */

import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { computeSongArc } from "../scoring/songArcReduction";

const router = Router();

router.get("/tracks/:trackId/arc", async (req: Request, res: Response) => {
  const { trackId } = req.params;

  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: { id: true, timeline: true },
  });

  if (!track) {
    res.status(404).json({ error: "not_found", message: "Track not found" });
    return;
  }

  if (!track.timeline) {
    res.status(422).json({
      error: "not_ready",
      message: "Track has not been analysed yet — timeline is missing",
    });
    return;
  }

  const timeline = track.timeline as number[][];
  const arc = computeSongArc(timeline, track.id);
  res.json(arc);
});

export default router;
