// GET /api/rights/evaluate
//
// Evaluates every track in the database through the deterministic rights state
// machine. Returns full evaluation per track including audit hash binding and
// computation trace. No external dependencies in the evaluation path.

import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import {
  evaluateTrack,
  ENGINE_VERSION,
  type TrackEvalInput,
} from "../scoring/rightsStateMachine";

const router = Router();

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v as string) : Number(v);
  return isNaN(n) ? null : n;
}

router.get("/rights/evaluate", async (_req: Request, res: Response) => {
  try {
    const tracks = await prisma.track.findMany({
      include: { rightsProfile: true },
      orderBy: { id: "asc" },
    });

    const evaluated_at = new Date().toISOString();

    const results = tracks.map((track) => {
      const rp = track.rightsProfile;

      // Map DB record → canonical TrackEvalInput
      const input: TrackEvalInput = {
        audio_id:         track.id,
        ingestion_source: "database",
        metadata: {
          isrc:       track.isrc,
          title:      track.title,
          artistName: track.artistName ?? null,
        },
        ownership: {
          masterOwnershipPct:        rp ? toNum(rp.masterOwnershipPct) : null,
          masterOwnedBy:             rp ? (rp as Record<string, unknown>).masterOwnedBy as string | null ?? null : null,
          masterOwnershipType:       rp ? (rp as Record<string, unknown>).masterOwnershipType as string | null ?? null : null,
          masterVerificationSource:  null,
        },
        publishing: {
          ascapWorkId:   rp?.ascapWorkId   ?? null,
          bmiWorkId:     rp ? (rp as Record<string, unknown>).bmiWorkId as string | null ?? null : null,
          writerName:    rp?.writerName    ?? null,
          writerIpi:     rp?.writerIpi     ?? null,
          publisherName: rp?.publisherName ?? null,
          proAffiliation: rp?.proAffiliation ?? null,
        },
        usage_rights: {
          isOneStop:             rp?.isOneStop ?? null,
          masterOwnershipSplits: null,
        },
      };

      const evaluation = evaluateTrack(input);

      return {
        audio_id:         track.id,
        title:            track.title,
        isrc:             track.isrc,
        artistName:       track.artistName ?? null,
        ingestion_source: "database",
        input,
        evaluation,
      };
    });

    res.json({
      engine_version: ENGINE_VERSION,
      evaluated_at,
      track_count: results.length,
      state_summary: results.reduce<Record<string, number>>((acc, r) => {
        acc[r.evaluation.rights_state] = (acc[r.evaluation.rights_state] ?? 0) + 1;
        return acc;
      }, {}),
      tracks: results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
